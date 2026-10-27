let selectedRole = '';

const joinForm = document.querySelector('#join-form');
const memberName = document.querySelector('#member-name');
const selectedRoleLabel = document.querySelector('#selected-role');
const joinError = document.querySelector('#join-error');

document.querySelectorAll('.role-card').forEach((roleCard) => {
  roleCard.addEventListener('click', () => {
    selectedRole = roleCard.dataset.role;
    document.querySelectorAll('.role-card').forEach((card) => {
      card.classList.toggle('selected', card === roleCard);
    });
    joinForm.hidden = false;
    selectedRoleLabel.textContent = `Joining as ${selectedRole}`;
    joinError.textContent = '';
    memberName.focus();
  });
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = memberName.value.trim();
  if (!selectedRole || !name) return;

  sessionStorage.setItem('bidly-member', JSON.stringify({
    name,
    role: selectedRole
  }));
  window.location.href = selectedRole === 'host'
    ? 'host-setup.html'
    : 'auction.html';
});
