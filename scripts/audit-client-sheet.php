<?php

/**
 * Builds the client-facing Lighthouse score workbook from the rows written by
 * scripts/audit-client-data.mjs — one tab per device (Mobile, Desktop), plus a
 * "How to read" tab.
 *
 * PhpSpreadsheet lives in the backend, so run this inside the backend container
 * with the input JSON copied somewhere it can read:
 *
 *   php audit-client-sheet.php meta.json out.xlsx
 *
 * meta.json:
 *   { "date": "7 October 2026", "host": "test--edge--creative2llc.aem.page",
 *     "tabs": [
 *       { "title": "Mobile", "device": "mobile", "rows": "rows-mobile.json",
 *         "previous": { "date": "17 September 2026", "pages": 83,
 *                       "performance": 88.1, "accessibility": 92.4, "bestPractices": 98.7 } },
 *       { "title": "Desktop", "device": "desktop", "rows": "rows-desktop.json", "previous": null }
 *     ] }
 *
 * Row files are resolved relative to meta.json.
 */

require getenv('PHPSPREADSHEET_AUTOLOAD') ?: '/var/www/html/vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\RichText\RichText;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Conditional;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

[$script, $metaFile, $outFile] = $argv + [null, null, null];
if (! $metaFile || ! $outFile) {
    fwrite(STDERR, "usage: php audit-client-sheet.php meta.json out.xlsx\n");
    exit(1);
}

$meta = json_decode(file_get_contents($metaFile), true, flags: JSON_THROW_ON_ERROR);
foreach ($meta['tabs'] as $i => $tab) {
    $meta['tabs'][$i]['rows'] = json_decode(
        file_get_contents(dirname($metaFile).'/'.$tab['rows']), true, flags: JSON_THROW_ON_ERROR,
    );
}

const NAVY = '0B1F33';
const HEADER_FILL = '0B1F33';
const SUBTLE = '595959';
const BAND_GREEN = ['C6EFCE', '006100'];
const BAND_AMBER = ['FFEB9C', '7F6000'];
const BAND_ORANGE = ['FCD5B4', '833C0B'];
const BAND_RED = ['FFC7CE', '9C0006'];

const DEVICES = [
    'mobile' => [
        'settings' => 'phone settings',
        'performance' => 'How fast the page loads on a phone (0-100).',
        'performanceComment' => 'Lighthouse simulates a mid-range phone on a slower mobile connection',
    ],
    'desktop' => [
        'settings' => 'desktop computer settings',
        'performance' => 'How fast the page loads on a desktop computer (0-100).',
        'performanceComment' => 'Lighthouse simulates a desktop computer on a fast connection, and grades load times more strictly than on a phone',
    ],
];

function band(string $operator, array $values, array $colours): Conditional
{
    $c = (new Conditional)->setConditionType(Conditional::CONDITION_CELLIS)->setOperatorType($operator);
    foreach ($values as $v) {
        $c->addCondition($v);
    }
    $c->getStyle()->getFill()->setFillType(Fill::FILL_SOLID)->getEndColor()->setRGB($colours[0]);
    $c->getStyle()->getFill()->getStartColor()->setRGB($colours[0]);
    $c->getStyle()->getFont()->getColor()->setRGB($colours[1]);

    return $c;
}

function buildScoresSheet(Worksheet $sheet, array $tab, array $meta): void
{
    $rows = $tab['rows'];
    $device = DEVICES[$tab['device']];
    $previous = $tab['previous'] ?? null;

    $sheet->setTitle($tab['title']);
    $sheet->setShowGridlines(false);

    $first = 11;
    $last = $first + count($rows) - 1;
    $range = fn (string $col): string => "{$col}{$first}:{$col}{$last}";

    $sheet->setCellValue('A1', 'NCMEC Website: Page Scores ('.$tab['title'].')');
    $sheet->getStyle('A1')->getFont()->setSize(16)->setBold(true)->getColor()->setRGB(NAVY);
    $sheet->setCellValue('A2', sprintf(
        'Tested %s on the preview site (%s) with Google Lighthouse, using %s. %d pages. '
        .'Goal: 95 or higher for Performance, Accessibility and Best Practices on every page. '
        .'See the "How to read" tab for what each score means.',
        $meta['date'], $meta['host'], $device['settings'], count($rows),
    ));
    $sheet->mergeCells('A2:I2');
    $sheet->getStyle('A2')->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);
    $sheet->getStyle('A2')->getFont()->getColor()->setRGB(SUBTLE);
    $sheet->getRowDimension(2)->setRowHeight(30);

    // Summary block: formulas over the table so it stays right if rows are edited.
    $lastSummaryCol = $previous ? 'D' : 'C';
    $sheet->fromArray([array_filter([
        'Score',
        'Average score',
        'Pages at 95 or higher',
        $previous ? 'Average on '.$previous['date'] : null,
    ])], null, 'A4');
    $summary = [
        ['Performance', 'B', 'performance'],
        ['Accessibility', 'C', 'accessibility'],
        ['Best Practices', 'D', 'bestPractices'],
    ];
    foreach ($summary as $i => [$label, $col, $key]) {
        $r = 5 + $i;
        $sheet->setCellValue("A{$r}", $label);
        $sheet->setCellValue("B{$r}", "=ROUND(AVERAGE({$range($col)}),1)");
        $sheet->setCellValue("C{$r}", "=COUNTIF({$range($col)},\">=95\")&\" of \"&COUNT({$range($col)})");
        if ($previous) {
            $sheet->setCellValue("D{$r}", $previous[$key]);
        }
    }
    $sheet->setCellValue('A8', 'All three at 95 or higher');
    $sheet->setCellValue('C8', "=COUNTIF({$range('E')},\"Yes\")&\" of \"&COUNTA({$range('A')})");
    if ($previous) {
        $sheet->getComment('D4')->getText()->createTextRun(
            'From the previous audit on '.$previous['date'].' ('.$previous['pages'].' pages, same settings). '
            .'Shown for comparison only.'
        );
        $sheet->getComment('D4')->setWidth('220pt')->setHeight('60pt');
    }

    $sheet->getStyle("A4:{$lastSummaryCol}4")->applyFromArray([
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => HEADER_FILL]],
    ]);
    $sheet->getStyle("A5:{$lastSummaryCol}8")->applyFromArray([
        'borders' => ['bottom' => ['borderStyle' => Border::BORDER_HAIR, 'color' => ['rgb' => 'BFBFBF']]],
    ]);
    $sheet->getStyle('A8')->getFont()->setBold(true);
    $sheet->getStyle("B5:{$lastSummaryCol}8")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
    $sheet->getStyle('B5:B7')->getNumberFormat()->setFormatCode('0.0');
    $sheet->getStyle('D5:D7')->getNumberFormat()->setFormatCode('0.0');

    // Table header: the name, then a one-line explanation in the cell itself.
    $headers = [
        'A' => ['Page', 'Address on the site. Click to open it.'],
        'B' => ['Performance', $device['performance']],
        'C' => ['Accessibility', 'How usable the page is for people with disabilities (0-100).'],
        'D' => ['Best Practices', 'Technical health: errors, security, image quality (0-100).'],
        'E' => ['Meets goal?', 'Yes when all three scores are 95+.'],
        'F' => ['Accessibility issues (detailed scan)', 'Elements failing the WCAG 2.2 AA check. 0 is the target.'],
        'G' => ['What is affecting Performance', 'The biggest causes, in plain language.'],
        'H' => ['What is affecting Accessibility', 'Each issue found by Lighthouse or the detailed scan.'],
        'I' => ['What is affecting Best Practices', 'Each issue Lighthouse found.'],
    ];
    $comments = [
        'B' => $device['performanceComment'].' and times how quickly the page appears, becomes usable, and whether content '
            .'jumps while loading. Pages under 95 were tested 3 times and the middle score is shown, '
            .'because this score varies a few points between runs.',
        'C' => 'Automated checks for things like text contrast, image descriptions, link and button names, and heading order. '
            .'A score of 100 means no automated issues were found; some accessibility checks still need a person to review.',
        'D' => 'Checks for browser errors, security settings, outdated code and images that are too low resolution for the screen.',
        'F' => 'A second, stricter automated scan (axe-core) against the WCAG 2.2 AA standard, run at the same screen size as this tab. '
            .'It counts every failing element on the page, so it can find issues the Lighthouse Accessibility score does not weigh heavily.',
    ];
    $headerRow = $first - 1;
    foreach ($headers as $col => [$name, $explain]) {
        $rich = new RichText;
        $rich->createTextRun($name)->getFont()->setName('Arial')->setSize(10)->setBold(true)->getColor()->setRGB('FFFFFF');
        $rich->createTextRun("\n".$explain)->getFont()->setName('Arial')->setSize(8)->getColor()->setRGB('D9E1EA');
        $sheet->getCell("{$col}{$headerRow}")->setValue($rich);
        if (isset($comments[$col])) {
            $sheet->getComment("{$col}{$headerRow}")->getText()->createTextRun($comments[$col]);
            $sheet->getComment("{$col}{$headerRow}")->setWidth('260pt')->setHeight('90pt');
        }
    }
    $sheet->getStyle("A{$headerRow}:I{$headerRow}")->applyFromArray([
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => HEADER_FILL]],
        'alignment' => ['wrapText' => true, 'vertical' => Alignment::VERTICAL_TOP],
    ]);
    $sheet->getRowDimension($headerRow)->setRowHeight(48);

    foreach ($rows as $i => $row) {
        $r = $first + $i;
        $label = $row['path'] === '/' ? '/ (Home)' : $row['path'];
        $sheet->setCellValue("A{$r}", $label);
        $sheet->getCell("A{$r}")->getHyperlink()->setUrl($row['url']);
        $sheet->getStyle("A{$r}")->getFont()->setUnderline(true)->getColor()->setRGB('1F4E79');

        if (isset($row['error'])) {
            $sheet->setCellValue("E{$r}", 'No');
            $sheet->setCellValue("G{$r}", 'This page could not be tested: '.$row['error']);

            continue;
        }

        $sheet->setCellValue("B{$r}", $row['performance']);
        $sheet->setCellValue("C{$r}", $row['accessibility']);
        $sheet->setCellValue("D{$r}", $row['bestPractices']);
        $sheet->setCellValue("E{$r}", "=IF(AND(B{$r}>=95,C{$r}>=95,D{$r}>=95),\"Yes\",\"No\")");
        $sheet->setCellValue("F{$r}", $row['axeIssues']);
        $sheet->setCellValue("G{$r}", $row['perfNote']);
        $sheet->setCellValue("H{$r}", $row['a11yNote']);
        $sheet->setCellValue("I{$r}", $row['bpNote']);

        if (count($row['performanceRuns']) > 1) {
            $sheet->getComment("B{$r}")->getText()->createTextRun(
                'Tested '.count($row['performanceRuns']).' times: '.implode(', ', $row['performanceRuns']).'. Middle score shown.'
            );
            $sheet->getComment("B{$r}")->setWidth('180pt')->setHeight('40pt');
        }
    }

    $sheet->getStyle("A{$first}:I{$last}")->applyFromArray([
        'alignment' => ['vertical' => Alignment::VERTICAL_TOP, 'wrapText' => true],
        'borders' => ['bottom' => ['borderStyle' => Border::BORDER_HAIR, 'color' => ['rgb' => 'BFBFBF']]],
    ]);
    $sheet->getStyle("B{$first}:F{$last}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
    $sheet->getStyle("B{$first}:D{$last}")->getFont()->setBold(true);

    $sheet->getStyle("B{$first}:D{$last}")->setConditionalStyles([
        band(Conditional::OPERATOR_GREATERTHANOREQUAL, [95], BAND_GREEN),
        band(Conditional::OPERATOR_BETWEEN, [90, 94], BAND_AMBER),
        band(Conditional::OPERATOR_BETWEEN, [50, 89], BAND_ORANGE),
        band(Conditional::OPERATOR_LESSTHAN, [50], BAND_RED),
    ]);
    $sheet->getStyle("E{$first}:E{$last}")->setConditionalStyles([
        band(Conditional::OPERATOR_EQUAL, ['"Yes"'], BAND_GREEN),
        band(Conditional::OPERATOR_EQUAL, ['"No"'], BAND_RED),
    ]);
    $sheet->getStyle("F{$first}:F{$last}")->setConditionalStyles([
        band(Conditional::OPERATOR_EQUAL, [0], BAND_GREEN),
        band(Conditional::OPERATOR_GREATERTHAN, [0], BAND_AMBER),
    ]);

    foreach (['A' => 46, 'B' => 14, 'C' => 14, 'D' => 14, 'E' => 12, 'F' => 18, 'G' => 52, 'H' => 52, 'I' => 44] as $col => $width) {
        $sheet->getColumnDimension($col)->setWidth($width);
    }
    $sheet->freezePane("B{$first}");
    $sheet->setAutoFilter("A{$headerRow}:I{$last}");
    $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)
        ->setFitToWidth(1)->setFitToHeight(0)->setRowsToRepeatAtTopByStartAndEnd($headerRow, $headerRow);
    $sheet->setSelectedCell('A1');
}

$book = new Spreadsheet;
$book->getDefaultStyle()->getFont()->setName('Arial')->setSize(10);
$book->getProperties()
    ->setTitle('NCMEC Website - Page Scores')
    ->setSubject('Lighthouse page scores, '.$meta['date']);

foreach ($meta['tabs'] as $i => $tab) {
    buildScoresSheet($i === 0 ? $book->getActiveSheet() : $book->createSheet(), $tab, $meta);
}

/* ----------------------------------------------------------------- How to read */

$guide = $book->createSheet();
$guide->setTitle('How to read');
$guide->setShowGridlines(false);
$guide->getColumnDimension('A')->setWidth(28);
$guide->getColumnDimension('B')->setWidth(100);

$pageCount = count($meta['tabs'][0]['rows']);
$tabNames = implode(' and ', array_column($meta['tabs'], 'title'));

$lines = [
    ['title', 'How to read the page scores'],
    ['blank'],
    ['head', 'What was tested'],
    ['row', 'Tool', 'Google Lighthouse, the same tool built into Chrome and used by Google PageSpeed Insights.'],
    ['row', 'Tabs', "Each page was tested twice, once with phone settings and once with desktop settings. The {$tabNames} tabs hold those two sets of results."],
    ['row', 'Mobile settings', 'A simulated mid-range phone on a slower mobile connection. This is the stricter test, and the one Google uses for search rankings.'],
    ['row', 'Desktop settings', 'A simulated desktop computer on a fast connection. Load times are graded more strictly than on a phone, but the faster connection and processor usually more than make up for it.'],
    ['row', 'Site', $meta['host'].' (the preview site). Scores on the live domain may differ slightly because of hosting and caching.'],
    ['row', 'Date', $meta['date'].'. '.$pageCount.' pages.'],
    ['row', 'Repeat runs', 'Performance varies a few points from one run to the next. Every page under 95 was tested 3 times and the middle score is shown. Hover over a Performance score to see all 3 runs.'],
    ['blank'],
    ['head', 'The scores (0 to 100, higher is better)'],
    ['row', 'Performance', 'How fast the page loads and becomes usable. The main factors are how long the main content takes to appear, whether content jumps around while loading, and how long scripts keep the device busy.'],
    ['row', 'Accessibility', 'How usable the page is for people with disabilities, including people using screen readers or keyboards and people with low vision. Automated checks cover things like text contrast, image descriptions and link names. Some accessibility checks still need a person to review.'],
    ['row', 'Best Practices', 'Technical health: no browser errors, secure settings, no outdated code, and images sharp enough for the screen.'],
    ['row', 'Accessibility issues (detailed scan)', 'A second, stricter check (axe-core, WCAG 2.2 AA), run at the same screen size as the tab. It counts every element on the page that fails. 0 is the target. It often finds the same problem as the Lighthouse Accessibility score but counts every instance.'],
    ['row', 'Meets goal?', 'Yes when Performance, Accessibility and Best Practices are all 95 or higher.'],
    ['blank'],
    ['head', 'Colours'],
    ['band', '95 to 100', 'Meets the goal.', BAND_GREEN],
    ['band', '90 to 94', 'Good (Google rates 90+ as good), but under our goal of 95.', BAND_AMBER],
    ['band', '50 to 89', 'Needs improvement.', BAND_ORANGE],
    ['band', '0 to 49', 'Poor.', BAND_RED],
    ['blank'],
    ['head', 'Notes'],
    ['row', 'No SEO score', 'Search engine (SEO) scores are left out on purpose. The preview site tells search engines not to index it, so its SEO score is always low. That will change once the site is on the live domain.'],
    ['row', 'Test pages', 'Some pages hold sample or test content created while building the site (for example "sample-10mb", "s3-test", "real-netsmartz-example" and "regular-resource-1"). Their scores reflect that test content.'],
    ['row', 'Plain-language notes', 'The "What is affecting..." columns translate Lighthouse findings into plain language. Load times in those notes come from the first test run.'],
];

$r = 1;
foreach ($lines as $line) {
    switch ($line[0]) {
        case 'title':
            $guide->setCellValue("A{$r}", $line[1]);
            $guide->getStyle("A{$r}")->getFont()->setSize(16)->setBold(true)->getColor()->setRGB(NAVY);
            break;
        case 'head':
            $guide->setCellValue("A{$r}", $line[1]);
            $guide->mergeCells("A{$r}:B{$r}");
            $guide->getStyle("A{$r}")->applyFromArray([
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => HEADER_FILL]],
            ]);
            break;
        case 'row':
        case 'band':
            $guide->setCellValue("A{$r}", $line[1]);
            $guide->setCellValue("B{$r}", $line[2]);
            $guide->getStyle("A{$r}")->getFont()->setBold(true);
            $guide->getStyle("A{$r}:B{$r}")->applyFromArray([
                'alignment' => ['wrapText' => true, 'vertical' => Alignment::VERTICAL_TOP],
                'borders' => ['bottom' => ['borderStyle' => Border::BORDER_HAIR, 'color' => ['rgb' => 'BFBFBF']]],
            ]);
            if ($line[0] === 'band') {
                $guide->getStyle("A{$r}")->applyFromArray([
                    'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $line[3][0]]],
                    'font' => ['color' => ['rgb' => $line[3][1]]],
                    'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
                ]);
            }
            break;
    }
    $r++;
}

$book->setActiveSheetIndex(0);
(new Xlsx($book))->save($outFile);
echo "wrote {$outFile} (".implode(', ', array_map(
    fn (array $tab): string => $tab['title'].': '.count($tab['rows']).' pages',
    $meta['tabs'],
)).")\n";
