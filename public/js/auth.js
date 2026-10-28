/* Sign-in and account recovery forms call only the matching same-origin API. */
const authApi = async (path, body) => {
  const response = await fetch(`/api/auth${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error?.message || 'Please try again.');
  return result.data;
};

const message = document.getElementById('form-message');
function showMessage(text, success = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('success', success);
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  let challenge = '';
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');
    const values = new FormData(loginForm);
    try {
      if (challenge) {
        await authApi('/verify-2fa', { challenge, code: String(values.get('code') || '') });
        location.replace('/');
        return;
      }
      const result = await authApi('/login', { email: values.get('email'), password: values.get('password') });
      if (result.requiresTwoFactor) {
        challenge = result.challenge;
        document.getElementById('twofa-field').hidden = false;
        loginForm.elements.password.disabled = true;
        showMessage('Enter the six-digit code from your authenticator app.', true);
        loginForm.elements.code.focus();
        return;
      }
      location.replace('/');
    } catch (error) { showMessage(error.message); }
  });
}

const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');
    const values = new FormData(signupForm);
    const password = String(values.get('password') || '');
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(password)) {
      showMessage('Use at least 8 characters with uppercase, lowercase, and a number.');
      return;
    }
    try {
      await authApi('/register', {
        name: values.get('name'), email: values.get('email'), role: values.get('role'), password,
        policyAccepted: values.get('policyAccepted') === 'on'
      });
      signupForm.reset();
      showMessage('Check your email for a verification link before signing in.', true);
    } catch (error) { showMessage(error.message); }
  });
  const passwordInput = document.getElementById('signup-password');
  passwordInput.addEventListener('input', () => {
    const value = passwordInput.value;
    const checks = [value.length >= 8, /[A-Z]/.test(value), /[a-z]/.test(value), /\d/.test(value), value.length >= 12];
    const score = checks.filter(Boolean).length;
    const fill = document.getElementById('strength-fill');
    const label = document.getElementById('strength-label');
    fill.className = `strength-fill strength-level-${score}`;
    label.textContent = value.length === 0 ? 'Password strength' : score < 3 ? 'Weak' : score < 5 ? 'Fair' : 'Strong';
  });
}

const forgotForm = document.getElementById('forgot-form');
if (forgotForm) forgotForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  try {
    const values = new FormData(forgotForm);
    const result = await authApi('/forgot-password', { email: values.get('email') });
    showMessage(result.message, true);
  } catch (error) { showMessage(error.message); }
});

const resetForm = document.getElementById('reset-form');
if (resetForm) resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  try {
    const values = new FormData(resetForm);
    await authApi('/reset-password', { token: new URLSearchParams(location.search).get('token'), password: values.get('password') });
    resetForm.reset();
    showMessage('Password changed. You can now sign in.', true);
  } catch (error) { showMessage(error.message); }
});

if (document.body && location.pathname === '/verify.html') {
  const token = new URLSearchParams(location.search).get('token');
  if (token) authApi('/verify-email', { token })
    .then(() => showMessage('Your email is confirmed. You can sign in now.', true))
    .catch((error) => showMessage(error.message));
  else showMessage('This verification link is incomplete.');
}
