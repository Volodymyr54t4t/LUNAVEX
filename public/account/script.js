(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let mode = 'login';
  function setMode(next) {
    mode = next;
    $('loginTab').classList.toggle('active', mode === 'login');
    $('registerTab').classList.toggle('active', mode === 'register');
    $('passwordHint').hidden = mode !== 'register';
    $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('submitButton').textContent = mode === 'register' ? 'Створити акаунт' : 'Увійти';
    $('pageTitle').textContent = mode === 'register' ? 'Створіть акаунт' : 'Увійдіть до LUNAVEX';
    $('pageDescription').textContent = mode === 'register' ? 'Нові результати й попередні дані цього браузера будуть збережені у вашому акаунті.' : 'Увійдіть, щоб відкрити збережені ділянки та дослідження.';
    $('formMessage').textContent = '';
  }
  $('loginTab').addEventListener('click', () => setMode('login'));
  $('registerTab').addEventListener('click', () => setMode('register'));
  async function refreshAccount() {
    try {
      const response = await fetch('/api/auth/me'), result = await response.json();
      if (result.authenticated) {
        $('authPanel').hidden = true; $('signedIn').hidden = false; $('accountEmail').textContent = result.account.email;
        $('pageTitle').textContent = 'Ви увійшли'; $('pageDescription').textContent = 'Ваші персональні дані синхронізуються з акаунтом.';
      }
    } catch { $('formMessage').textContent = 'Не вдалося перевірити сесію. Оновіть сторінку.'; $('formMessage').dataset.state = 'error'; }
  }
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('submitButton'); button.disabled = true; $('formMessage').textContent = mode === 'register' ? 'Створюємо акаунт…' : 'Перевіряємо дані…';
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Не вдалося виконати запит.');
      $('formMessage').dataset.state = ''; $('formMessage').textContent = mode === 'register' ? 'Акаунт створено. Відкриваємо Explorer…' : 'Вхід успішний. Відкриваємо Explorer…';
      location.assign('/explorer/');
    } catch (error) { $('formMessage').textContent = error.message; $('formMessage').dataset.state = 'error'; }
    finally { button.disabled = false; }
  });
  $('logoutButton').addEventListener('click', async () => {
    try { const response = await fetch('/api/auth/logout', { method: 'POST' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); location.assign('/account/'); }
    catch (error) { $('pageDescription').textContent = error.message; }
  });
  refreshAccount();
})();
