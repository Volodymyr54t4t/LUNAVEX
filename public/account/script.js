(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const colors = new Set(['#73d8e8', '#c7ec7c', '#dda4ff', '#ffb87a', '#ff8ca8', '#8daeff']);
  let mode = 'login';
  function setMode(next) {
    mode = next;
    $('loginTab').classList.toggle('active', mode === 'login'); $('registerTab').classList.toggle('active', mode === 'register');
    $('passwordHint').hidden = mode !== 'register'; $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('submitButton').textContent = mode === 'register' ? 'Створити акаунт' : 'Увійти';
    $('pageTitle').textContent = mode === 'register' ? 'Створіть акаунт' : 'Увійдіть до LUNAVEX';
    $('pageDescription').textContent = mode === 'register' ? 'Нові результати й дані цього браузера збережуться у вашому профілі.' : 'Увійдіть, щоб переглянути свої ділянки та дослідження.';
    $('formMessage').textContent = '';
  }
  $('loginTab').addEventListener('click', () => setMode('login')); $('registerTab').addEventListener('click', () => setMode('register'));
  function initials(name, email) { const words = String(name || email || 'L').trim().split(/[\s@._-]+/).filter(Boolean); return words.slice(0, 2).map(x => [...x][0]).join('').toUpperCase(); }
  function renderProfile(profile) {
    $('authPanel').hidden = true; $('profileDashboard').hidden = false;
    const label = profile.displayName || profile.email.split('@')[0];
    $('profileHeading').textContent = `Вітаємо, ${label}`; $('profileSubtitle').textContent = profile.roleTitle || profile.email;
    $('memberSince').textContent = profile.createdAt ? `У LUNAVEX з ${new Date(profile.createdAt).toLocaleDateString('uk-UA', { dateStyle: 'long' })}` : '';
    $('avatarMark').textContent = initials(label, profile.email); $('avatarMark').style.setProperty('--avatar-color', colors.has(profile.avatarColor) ? profile.avatarColor : '#73d8e8');
    $('displayName').value = profile.displayName || label; $('roleTitle').value = profile.roleTitle || ''; $('bio').value = profile.bio || ''; $('avatarColor').value = colors.has(profile.avatarColor) ? profile.avatarColor : '#73d8e8';
    $('pageTitle').textContent = 'Ваш дослідницький профіль';
  }
  async function loadAnalytics() {
    try {
      const response = await fetch('/api/profile/analytics'), data = await response.json(); if (!response.ok) throw new Error(data.error || 'Не вдалося завантажити статистику.');
      const c = data.counts; $('totalRecords').textContent = Number(data.totalRecords).toLocaleString('uk-UA'); $('siteCount').textContent = Number(c.sites).toLocaleString('uk-UA'); $('researchCount').textContent = (Number(c.illumination) + Number(c.earthlink)).toLocaleString('uk-UA'); $('missionCount').textContent = Number(c.artemis).toLocaleString('uk-UA');
      const definitions = [['Ділянки Explorer','sites','⚑'],['Освітленість','illumination','☼'],['EarthLink','earthlink','↗'],['Енергетика','energy','ϟ'],['Радіаційний захист','radiation','◈'],['Тепловий режим','thermo','⌁'],['Artemis','artemis','◎']];
      const max = Math.max(1, ...definitions.map(([,key]) => Number(c[key]))), container = $('moduleStats'); container.replaceChildren();
      definitions.forEach(([label,key,icon]) => { const row=document.createElement('div');row.className='module-stat-row';const title=document.createElement('div');title.className='module-stat-label';const sym=document.createElement('span');sym.textContent=icon;const name=document.createElement('b');name.textContent=label;title.append(sym,name);const count=document.createElement('strong');count.textContent=Number(c[key]).toLocaleString('uk-UA');const track=document.createElement('div');track.className='stat-track';const fill=document.createElement('i');fill.style.width=`${Math.max(0,Number(c[key])/max*100)}%`;track.append(fill);row.append(title,count,track);container.append(row);});
      $('analyticsStatus').textContent = `Оновлено ${new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})}`;
      const activity=$('recentActivity');activity.replaceChildren();
      if (!data.recentActivity.length) { const empty=document.createElement('p');empty.className='profile-muted';empty.textContent='Поки що немає збережених записів. Відкрийте модуль і створіть перше дослідження.';activity.append(empty); }
      data.recentActivity.forEach(item=>{const row=document.createElement('div');row.className='activity-row';const mark=document.createElement('span');mark.className='activity-mark';mark.textContent=initials(item.module);const text=document.createElement('div');text.className='activity-copy';const title=document.createElement('b');title.textContent=item.label || item.module;const module=document.createElement('small');module.textContent=item.module;text.append(title,module);const date=document.createElement('time');date.dateTime=item.created_at;date.textContent=new Date(item.created_at).toLocaleString('uk-UA',{dateStyle:'medium',timeStyle:'short'});row.append(mark,text,date);activity.append(row);});
    } catch (error) { $('analyticsStatus').textContent=error.message; }
  }
  async function refreshAccount() {
    try { const response=await fetch('/api/auth/me'), result=await response.json();if(result.authenticated){renderProfile(result.account);await loadAnalytics();} }
    catch { $('formMessage').textContent='Не вдалося перевірити сесію. Оновіть сторінку.';$('formMessage').dataset.state='error'; }
  }
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault();const button=$('submitButton');button.disabled=true;$('formMessage').textContent=mode==='register'?'Створюємо акаунт…':'Перевіряємо дані…';
    try { const response=await fetch(`/api/auth/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})}),result=await response.json();if(!response.ok)throw new Error(result.error||'Не вдалося виконати запит.');$('formMessage').dataset.state='';$('formMessage').textContent='Готово. Відкриваємо профіль…';location.assign('/account/'); }
    catch(error){$('formMessage').textContent=error.message;$('formMessage').dataset.state='error';}finally{button.disabled=false;}
  });
  $('profileForm').addEventListener('submit',async event=>{
    event.preventDefault();const status=$('profileSaveStatus');status.textContent='Зберігаємо…';
    try{const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:$('displayName').value,roleTitle:$('roleTitle').value,bio:$('bio').value,avatarColor:$('avatarColor').value})}),data=await response.json();if(!response.ok)throw new Error(data.error||'Не вдалося зберегти профіль.');renderProfile(data.profile);status.dataset.state='';status.textContent='Профіль збережено';}
    catch(error){status.textContent=error.message;status.dataset.state='error';}
  });
  $('logoutButton').addEventListener('click',async()=>{try{const response=await fetch('/api/auth/logout',{method:'POST'}),result=await response.json();if(!response.ok)throw new Error(result.error);location.assign('/account/');}catch(error){$('profileSaveStatus').textContent=error.message;}});
  refreshAccount();
})();
