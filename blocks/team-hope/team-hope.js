import decorateTeamHopeVolunteer from '../team-hope-volunteer/team-hope-volunteer.js';

export default function decorate(block) {
  block.classList.add('team-hope-volunteer');
  decorateTeamHopeVolunteer(block);
}
