        /* =========================================
           PEEMCN25 - App Logic (ALL-IN-ONE)
           ========================================= */

        // 1. ตัวช่วยความปลอดภัย (กัน XSS)
        //    (ลบระบบรายงานบั๊กที่ส่งไป ngrok ออกแล้ว — ปลายทางปิดไปแล้ว ทุก error จะยิงคำขอที่ล้มเหลว)
        function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
        // ข้อความที่แก้ได้จากหน้าเว็บ: เก็บไว้เป็นข้อความล้วน อนุญาตแค่การขึ้นบรรทัดใหม่ (<br>)
        function sanitizeRich(html) {
            // ขึ้นบรรทัด: <br> = บรรทัดใหม่, ท้าย <p>/<div> = ย่อหน้าใหม่ · เก็บตัวหนา <b>/<strong> ไว้
            const marked = String(html ?? '')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/(p|div)>/gi, '\n\n')
                .replace(/<(b|strong)(\s[^>]*)?>/gi, '\u0001').replace(/<\/(b|strong)>/gi, '\u0002');
            // DOMParser ไม่รันสคริปต์/ไม่โหลดรูป (ต่างจาก innerHTML ที่ทำให้ <img onerror> ทำงาน)
            let text = new DOMParser().parseFromString(marked, 'text/html').body.textContent || '';
            text = text.replace(/[ \t ]+/g, ' ')          // ช่องว่างซ้อน/&nbsp; ยาวๆ ที่ติดมาจากการก๊อปวาง → ช่องเดียว
                .split('\n').map(line => line.trim()).join('\n')
                .replace(/\n{3,}/g, '\n\n').trim();
            return escapeHtml(text).replace(/\u0001/g, '<b>').replace(/\u0002/g, '</b>').replace(/\n/g, '<br>');
        }
        // อนุญาตเฉพาะลิงก์ http/https เท่านั้น (กัน javascript: ฯลฯ)
        function safeUrl(url) {
            let link = String(url || '').trim();
            if (!link) return '';
            if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) link = 'https://' + link;
            try { const u = new URL(link); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : ''; } catch (e) { return ''; }
        }
        function decodeEntities(text) {
            const tmp = document.createElement('textarea'); tmp.innerHTML = String(text ?? ''); return tmp.value;
        }

        // 2. ตัวแปรตั้งต้นและ API
        const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyTA1ZaJi3ieoEJt6mQD12Y-Ti5KY-uuyS3SdgmoFGL64jtgZM2xVdyg7GP1pSer46ZCQ/exec";
        const SERVER_URL = 'https://retro-api.peemcn25.dev'; 

        let scheduleData = []; 
        let today = new Date(); 
        let currentMonth = today.getMonth(); 
        let currentYear = today.getFullYear();
        const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

        let projectData = [
            { name: "CODE CONTRA V.2.EXE", desc: "> ฝ่าด่านสุดมันส์ไปกับเกมยิงสไตล์ Retro 8-bit ที่สร้างสรรค์ขึ้นมาใหม่!", url: "https://codecontrav2by101studio.netlify.app/", icon: "▶ PLAY GAME" },
            { name: "MEDICINE DISPENSER SYS.", desc: "> Web App สำหรับควบคุมตู้จ่ายยาอัตโนมัติ ใช้งานง่าย", url: "https://example.com/medicine", icon: "🔗 OPEN WEB" },
            { name: "GOV_PORTAL NETWORK", desc: "> ระบบเว็บไซต์หน่วยงาน ออกแบบ UI/UX ให้ใช้งานคล่องตัว", url: "https://example.com/gov", icon: "🔗 OPEN WEB" }
        ];

        // 3. ระบบเรนเดอร์ Projects (การ์ด v2: รูปตัวอย่าง + ป้ายเทคโนโลยี + ตัวกรอง)
        // ค่าเริ่มต้นสำหรับโปรเจกต์เดิมที่ยังไม่มี cat/tags (แอดมินแก้ทับได้ในโหมดแก้ไข)
        const PROJECT_DEFAULTS = {
            'codecontra.peemcn25.dev': { cat: 'game', tags: 'JavaScript, Canvas, Game' },
            'tuya.peemcn25.dev': { cat: 'iot', tags: 'ESP32, MQTT, Node.js, Omise, Firebase' },
            'www.bppgsd2.com': { cat: 'web', tags: 'Web, UI/UX, Gov' },
            'cn25.peemcn25.dev': { cat: 'web', tags: 'HTML, CSS, JavaScript' },
        };
        const PROJECT_CATS = ['web', 'game', 'iot'];
        let projectFilter = 'all';
        function projectMeta(proj) {
            let host = ''; try { host = new URL(safeUrl(proj.url)).hostname; } catch (e) {}
            const d = PROJECT_DEFAULTS[host] || {};
            const cat = PROJECT_CATS.includes(String(proj.cat || '').toLowerCase()) ? String(proj.cat).toLowerCase() : (d.cat || 'web');
            const tags = String(proj.tags ?? d.tags ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 8);
            return { cat, tags };
        }
        function thumbUrl(url) { return 'https://s0.wp.com/mshots/v1/' + encodeURIComponent(url) + '?w=640&h=400'; }
        // ---------- รางวัลของโปรเจกต์ (เก็บใน project_list: awards[]) ----------
        const AWARD_TIERS = {
            gold:   { label: 'ชนะเลิศ',        mark: '1' },
            silver: { label: 'รองชนะเลิศ อันดับ 1', mark: '2' },
            bronze: { label: 'รองชนะเลิศ อันดับ 2', mark: '3' },
            honor:  { label: 'รางวัลพิเศษ / ชมเชย', mark: '★' },
            finalist: { label: 'ผ่านเข้ารอบ / Finalist', mark: 'F' },
        };
        function projectAwards(proj) {
            return Array.isArray(proj.awards) ? proj.awards.filter(a => a && (a.title || a.from)).slice(0, 12) : [];
        }
        function renderMedals(proj, awards) {
            if (!awards.length) return null;
            const row = document.createElement('div'); row.className = 'pcard-medals';
            awards.slice(0, 5).forEach(a => {
                const tier = AWARD_TIERS[a.tier] ? a.tier : 'gold';
                const b = document.createElement('button'); b.type = 'button';
                b.className = 'medal medal-' + tier;
                b.innerHTML = '<i><b></b></i>'; b.querySelector('b').textContent = AWARD_TIERS[tier].mark;
                b.title = `${a.title || AWARD_TIERS[tier].label}${a.from ? ' · ' + a.from : ''}`;
                b.setAttribute('aria-label', `รางวัล: ${b.title} (กดเพื่อดูรายละเอียด)`);
                b.addEventListener('click', (e) => { e.stopPropagation(); openAward(proj, a); });
                row.appendChild(b);
            });
            if (awards.length > 5) { const more = document.createElement('span'); more.className = 'medal-more'; more.textContent = `+${awards.length - 5}`; row.appendChild(more); }
            return row;
        }
        function openAward(proj, a) {
            const tier = AWARD_TIERS[a.tier] ? a.tier : 'gold';
            const m = document.getElementById('award-modal');
            const medal = m.querySelector('.award-medal'); medal.className = 'award-medal medal medal-' + tier; medal.innerHTML = '<i><b></b></i>'; medal.querySelector('b').textContent = AWARD_TIERS[tier].mark;
            m.querySelector('.award-tier').textContent = AWARD_TIERS[tier].label;
            m.querySelector('.award-title').textContent = a.title || AWARD_TIERS[tier].label;
            m.querySelector('.award-project').textContent = proj.name || '';
            const rows = m.querySelector('.award-facts'); rows.replaceChildren();
            [['ได้รับจาก', a.from], ['วันที่', a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '']].forEach(([k, v]) => {
                if (!v) return; const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; rows.append(dt, dd);
            });
            m.querySelector('.award-detail').textContent = a.detail || '';
            const link = m.querySelector('.award-link'), u = safeUrl(a.url);
            link.hidden = !u || u === 'https:///'; if (!link.hidden) link.href = u;
            m.classList.add('open'); m.querySelector('.award-close').focus();
            playLevelUpSound();
        }
        function closeAward() { document.getElementById('award-modal').classList.remove('open'); }
        // แอดมิน: แก้รางวัลของโปรเจกต์ index (กดลงใน projectData ทันที แล้วกด SAVE CONFIG)
        function renderAwardEditor(index) {
            const wrap = document.createElement('div'); wrap.className = 'award-editor';
            const head = document.createElement('div'); head.className = 'url-label'; head.textContent = '🏅 รางวัล:'; wrap.appendChild(head);
            const list = projectData[index].awards = Array.isArray(projectData[index].awards) ? projectData[index].awards : [];
            const rerender = () => renderProjects();
            list.forEach((a, i) => {
                const row = document.createElement('div'); row.className = 'award-row';
                const sel = document.createElement('select');
                Object.entries(AWARD_TIERS).forEach(([k, v]) => sel.appendChild(new Option(`${v.mark} ${v.label}`, k)));
                sel.value = AWARD_TIERS[a.tier] ? a.tier : 'gold';
                sel.addEventListener('change', () => { a.tier = sel.value; rerender(); });
                const mk = (ph, key, type = 'text', max = 120) => { const inp = document.createElement(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') inp.type = type; else inp.rows = 2; inp.placeholder = ph; inp.value = a[key] || ''; inp.maxLength = max; inp.addEventListener('input', () => { a[key] = inp.value; }); inp.addEventListener('change', rerender); return inp; };
                const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'X'; del.title = 'ลบรางวัลนี้';
                del.addEventListener('click', () => { if (confirm('ลบรางวัลนี้?')) { list.splice(i, 1); rerender(); } });
                const line1 = document.createElement('div'); line1.className = 'award-line'; line1.append(sel, del);
                row.append(line1, mk('ชื่อรางวัล เช่น ชนะเลิศ Hackathon 2026', 'title'), mk('ได้รับจาก เช่น งาน/ผู้จัด/มหาวิทยาลัย', 'from'), mk('', 'date', 'date'), mk('รายละเอียด (ไม่ใส่ก็ได้)', 'detail', 'textarea', 400), mk('ลิงก์ข่าว/เกียรติบัตร (ไม่ใส่ก็ได้)', 'url', 'url', 300));
                wrap.appendChild(row);
            });
            const add = document.createElement('button'); add.type = 'button'; add.className = 'action-btn award-add'; add.textContent = '[+] เพิ่มรางวัล';
            add.addEventListener('click', () => { list.push({ tier: 'gold', title: '', from: '', date: '', detail: '', url: '' }); rerender(); });
            wrap.appendChild(add);
            return wrap;
        }
        function renderProjects() {
            const container = document.getElementById('dynamic-project-container');
            if(!container) return;
            container.replaceChildren();
            const isEdit = document.body.classList.contains('edit-mode');
            // สร้างด้วย DOM API + textContent: ข้อมูลจาก Firestore จะไม่ถูกตีความเป็น HTML
            const makeEditable = (tag, className, text, onSave) => {
                const node = document.createElement(tag);
                node.className = className + (isEdit ? ' editable' : '');
                node.textContent = text ?? '';
                if (isEdit) { node.contentEditable = 'true'; node.addEventListener('blur', () => onSave(node.innerText.trim())); }
                return node;
            };
            let shown = 0;
            projectData.forEach((proj, index) => {
                // ซ่อนโปรเจกต์ที่ยังไม่ได้กรอก จากผู้เข้าชม — แอดมินยังเห็นเพื่อแก้ไข
                const link = safeUrl(proj.url);
                const isPlaceholder = !link || link === 'https:///' || proj.name === 'NEW_PROJECT.EXE';
                if (isPlaceholder && !isEdit) return;
                const meta = projectMeta(proj);
                const awards = projectAwards(proj);
                if (!isEdit && projectFilter !== 'all' && (projectFilter === 'award' ? !awards.length : meta.cat !== projectFilter)) return;
                shown++;

                const card = document.createElement('article'); card.className = 'pcard';
                const thumb = document.createElement('div'); thumb.className = 'pcard-thumb';
                const medalRow = renderMedals(proj, awards);
                thumb.textContent = meta.cat === 'game' ? '▶' : meta.cat === 'iot' ? '⚙' : '⌘';
                if (!isPlaceholder) {
                    const badge = document.createElement('span'); badge.className = 'pcard-badge'; badge.textContent = '● LIVE';
                    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
                    img.src = thumbUrl(link); img.onerror = () => img.remove();
                    thumb.append(badge, img);
                }

                const body = document.createElement('div'); body.className = 'pcard-body';
                body.appendChild(makeEditable('h3', 'project-title', proj.name, v => { projectData[index].name = v; }));
                body.appendChild(makeEditable('p', 'project-desc', String(proj.desc || '').replace(/^>\s*/, ''), v => { projectData[index].desc = v; }));

                const tags = document.createElement('div'); tags.className = 'pcard-tags';
                meta.tags.forEach(t => { const s = document.createElement('span'); s.className = 'pcard-tag'; s.textContent = t; tags.appendChild(s); });
                body.appendChild(tags);

                // แอดมิน: แก้ URL / หมวด / ป้าย / ลิงก์โค้ด
                const admin = document.createElement('div'); admin.className = 'pcard-admin';
                const field = (label, value, onSave) => {
                    const row = document.createElement('div');
                    const l = document.createElement('span'); l.className = 'url-label'; l.textContent = label + ' ';
                    row.append(l, makeEditable('span', 'proj-url-edit', value, onSave));
                    admin.appendChild(row);
                };
                field('URL:', proj.url, v => { projectData[index].url = v; });
                if (isEdit) {
                    const row = document.createElement('div');
                    const l = document.createElement('span'); l.className = 'url-label'; l.textContent = 'หมวด: ';
                    const sel = document.createElement('select');
                    [['web', 'WEB · เว็บไซต์'], ['game', 'GAME · เกม'], ['iot', 'IOT · ฮาร์ดแวร์']].forEach(([v, t_]) => sel.appendChild(new Option(t_, v)));
                    sel.value = meta.cat; sel.addEventListener('change', () => { projectData[index].cat = sel.value; });
                    row.append(l, sel); admin.appendChild(row);
                }
                field('ป้ายเทคโนโลยี (คั่นด้วย ,):', meta.tags.join(', '), v => { projectData[index].tags = v; });
                field('ลิงก์โค้ด GitHub (ไม่ใส่ก็ได้):', proj.code || '', v => { projectData[index].code = v; });
                if (isEdit) admin.appendChild(renderAwardEditor(index));
                body.appendChild(admin);

                const actions = document.createElement('div'); actions.className = 'pcard-actions';
                const openBtn = document.createElement('button');
                openBtn.className = 'action-btn sound-trigger';
                openBtn.textContent = (proj.icon || '🔗 OPEN WEB').replace('🔗 ', '↗ ');
                openBtn.addEventListener('mousedown', playRetroClick);
                openBtn.addEventListener('click', () => openTargetLinkStr(projectData[index].url));
                actions.appendChild(openBtn);
                const code = safeUrl(proj.code);
                if (code && code !== 'https:///') {
                    const codeBtn = document.createElement('button');
                    codeBtn.className = 'action-btn alt sound-trigger'; codeBtn.textContent = '</> CODE';
                    codeBtn.addEventListener('mousedown', playRetroClick);
                    codeBtn.addEventListener('click', () => openTargetLinkStr(projectData[index].code));
                    actions.appendChild(codeBtn);
                }
                if (isEdit) {
                    const delBtn = document.createElement('button');
                    delBtn.className = 'action-btn sound-trigger';
                    delBtn.style.cssText = 'background:#da1e28; flex:none;';
                    delBtn.textContent = 'X'; delBtn.title = 'ลบโปรเจกต์';
                    delBtn.addEventListener('click', () => deleteProject(index));
                    actions.appendChild(delBtn);
                }
                body.appendChild(actions);
                card.append(thumb, body);
                if (medalRow) thumb.appendChild(medalRow);
                container.appendChild(card);
            });
            if (!shown) {
                const empty = document.createElement('p'); empty.className = 'agenda-empty'; empty.textContent = '> NO PROJECTS IN THIS CATEGORY.';
                container.appendChild(empty);
            }
            document.getElementById('proj-filters').style.display = isEdit ? 'none' : '';
        }
        document.addEventListener('click', (e) => {
            const chip = e.target.closest('#proj-filters .proj-chip');
            if (!chip) return;
            playRetroClick();
            projectFilter = chip.dataset.f;
            document.querySelectorAll('#proj-filters .proj-chip').forEach(c => c.classList.toggle('on', c === chip));
            renderProjects();
        });
        window.goPhotos = function(e) {
            switchTab(e, 'home');
            setTimeout(() => { const sec = document.getElementById('photo-section'); (sec && sec.style.display !== 'none' ? sec : document.getElementById('memories-section')).scrollIntoView({ block: 'start' }); }, 50);
        };
        window.goProjects = function(e) {
            switchTab(e, 'home');
            setTimeout(() => document.getElementById('proj-anchor').scrollIntoView({ block: 'start' }), 50);
        };
        window.addNewProject = function() { projectData.push({ name: "NEW_PROJECT.EXE", desc: "> คำอธิบาย...", url: "https://", icon: "🔗 OPEN WEB" }); renderProjects(); document.getElementById('save-btn').click(); }
        window.deleteProject = function(index) { if(confirm("DELETE THIS PROJECT? (Y/N)")) { projectData.splice(index, 1); renderProjects(); document.getElementById('save-btn').click(); } }
        window.openTargetLinkStr = function(url) {
            if (document.body.classList.contains('edit-mode')) return;
            const link = safeUrl(url);
            if (link && link !== 'https:///') window.open(link, '_blank', 'noopener');
        }

        // 4. ระบบแฟ้มข้อมูล ARCHIVE (Google Drive)
        let allFiles = []; 
        let folderHistory = []; 
        let currentFolderId = 'root';
        let currentSort = { column: 'date', direction: 'desc' }; 
        let currentViewMode = 'list'; 
        let targetSecretBtn = null;
        let inSecretArea = false; // อยู่ในโฟลเดอร์ลับ (รวมโฟลเดอร์ย่อย) หรือไม่
        const SECRET_FOLDER_ID = '1waXWwHFGtWFfSpz2wnvld6UNq-CqZgV8';

        // ระบบแจ้งเตือนเข้า LINE บอท
        function sendLineNotify(dateStr, title) { 
            const formData = new URLSearchParams(); 
            formData.append("action", "notify_now"); 
            formData.append("date", dateStr); 
            formData.append("title", title); 
            fetch(GOOGLE_APP_SCRIPT_URL, { method: "POST", body: formData, mode: 'no-cors' }); 
        }

        // โฟลเดอร์ลับ + แจ้งเตือน
        window.loadSecretFolder = function(btnElement) {
            const currentUser = fbUser();
            
            if (currentUser) {
                loadDriveFolder(btnElement, 'TOP_SECRET', SECRET_FOLDER_ID);
                
                // ถ้ายูสเซอร์ไม่ใช่แอดมิน ให้เตือนว่าแอบเข้าโฟลเดอร์ลับ
                if (currentUser && currentUser.email !== 'peemdiamond@gmail.com') {
                    // ดึงเฉพาะตัวเลขรหัสนักศึกษาหน้า @
                    const studentId = currentUser.email.split('@')[0];
                    sendLineNotify(new Date().toLocaleDateString('en-CA'), `🚨 นักศึกษา ${studentId} เข้าดูโฟลเดอร์ TOP SECRET`);
                }
            } else {
                playRetroClick();
                targetSecretBtn = btnElement;
                document.getElementById('secret-email').value = '';
                document.getElementById('secret-password').value = '';
                document.getElementById('secret-modal').style.display = 'flex';
                document.getElementById('secret-email').focus();
                loadFirebase().catch(console.error);
            }
        }

        window.loadDriveFolder = function(btnElement, folderName, baseFolderId) {
            document.querySelectorAll('.folder-btn').forEach(b => b.classList.remove('active'));
            if(btnElement) btnElement.classList.add('active');
            inSecretArea = baseFolderId === SECRET_FOLDER_ID;
            document.getElementById('archive-ext-link').href = `https://drive.google.com/drive/folders/${encodeURIComponent(baseFolderId)}`;
            document.getElementById('archive-ext-link').style.display = 'flex';
            folderHistory = [{ id: baseFolderId, name: folderName }];
            currentFolderId = baseFolderId;
            updatePathDisplay();
            fetchFiles(currentFolderId);
        }

        function formatDOSDate(isoDate) {
            if(!isoDate) return "<DIR>";
            const d = new Date(isoDate);
            return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }
        function formatDOSSize(bytes) {
            if(!bytes) return "";
            return Math.ceil(bytes / 1024).toLocaleString() + " KB";
        }

        // ระบบดูไฟล์ + แจ้งเตือน
        window.openPreview = function(fileId, fileName) {
            document.getElementById('preview-title').innerText = `VIEWING: ${fileName}`;
            document.getElementById('preview-frame').src = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
            document.getElementById('preview-modal').style.display = 'flex';

            const currentUser = fbUser();
            // ถ้ายูสเซอร์ไม่ใช่แอดมิน ให้แจ้งเตือนว่ากำลังดูไฟล์ไหนอยู่
            if (currentUser && currentUser.email !== 'peemdiamond@gmail.com') {
                const studentId = currentUser.email.split('@')[0];
                sendLineNotify(new Date().toLocaleDateString('en-CA'), `👁️ นักศึกษา ${studentId} กำลังเปิดไฟล์: ${fileName}`);
            }
        }
        window.closePreview = function() {
            document.getElementById('preview-modal').style.display = 'none';
            document.getElementById('preview-frame').src = '';
        }

        window.fetchFiles = async function(folderId) {
            const fileListDiv = document.getElementById('file-list');
            fileListDiv.innerHTML = `<span style="color:var(--ibm-accent-blue); font-family: 'VT323'; font-size:1.4rem; padding:10px;">> FETCHING DATA...</span>`;
            try {
                const headers = { 'ngrok-skip-browser-warning': 'true' };
                const currentUser = fbUser();
                if (currentUser) {
                    const token = await currentUser.getIdToken(); 
                    headers['Authorization'] = `Bearer ${token}`;
                }
                const fetchUrl = `${SERVER_URL}/list-files?folderId=${encodeURIComponent(folderId)}`;
                const response = await fetch(fetchUrl, { headers: headers });
                if (!response.ok) throw new Error(`HTTP ERROR: ${response.status}`);
                const data = await response.json();
                allFiles = Array.isArray(data) ? data.filter(f => f && typeof f.name === 'string') : []; 
                filterFiles(); 
            } catch (error) { 
                fileListDiv.innerHTML = `<span style="color:#da1e28; font-family: 'VT323'; font-size:1.4rem; padding:10px;">> ERROR: CONNECTION LOST<br>> DETAILS: ${escapeHtml(error.message)}</span>`; 
            }
        }

        window.toggleSort = function(column) {
            playRetroClick();
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = column === 'name' ? 'asc' : 'desc';
            }
            filterFiles();
        }

        function getSortedFiles(files) {
            return files.slice().sort((a, b) => {
                const isFolderA = a.mimeType === 'application/vnd.google-apps.folder' || a.name.endsWith('[FOLDER]');
                const isFolderB = b.mimeType === 'application/vnd.google-apps.folder' || b.name.endsWith('[FOLDER]');
                if (isFolderA !== isFolderB) return isFolderA ? -1 : 1;
                let valA, valB;
                if (currentSort.column === 'name') {
                    valA = a.name.toLowerCase(); valB = b.name.toLowerCase();
                } else if (currentSort.column === 'date') {
                    valA = new Date(a.createdTime || 0).getTime(); valB = new Date(b.createdTime || 0).getTime();
                } else if (currentSort.column === 'size') {
                    valA = parseInt(a.size || 0, 10); valB = parseInt(b.size || 0, 10);
                }
                if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        window.toggleViewMode = function() {
            currentViewMode = currentViewMode === 'list' ? 'grid' : 'list';
            document.getElementById('view-toggle-btn').innerText = currentViewMode === 'list' ? '[ VIEW: LIST ]' : '[ VIEW: GRID ]';
            filterFiles();
        }

        // แทน onclick="...('ชื่อไฟล์')" ด้วย data-attribute + ตัวดักคลิกตัวเดียว (ชื่อไฟล์แปลกๆ จะรันโค้ดไม่ได้)
        function fileClickAttrs(file, isFolder) {
            return `data-action="${isFolder ? 'folder' : 'file'}" data-id="${escapeHtml(file.id)}" data-name="${escapeHtml(file.name)}"`;
        }
        document.addEventListener('click', (e) => {
            const item = e.target.closest('#file-list [data-action]');
            if (!item) return;
            playRetroClick();
            if (item.dataset.action === 'folder') enterFolder(item.dataset.id, item.dataset.name);
            else openPreview(item.dataset.id, item.dataset.name);
        });

        function renderFilesList(filesToDisplay) {
            const fileListDiv = document.getElementById('file-list');
            let htmlStr = ''; 
            const sortedFiles = getSortedFiles(filesToDisplay);

            if (sortedFiles.length === 0 && folderHistory.length <= 1) {
                fileListDiv.innerHTML = '<span style="color:var(--ibm-shadow); font-family: \'VT323\'; font-size:1.4rem; padding: 10px;">> DIRECTORY IS EMPTY.</span>';
                return;
            }

            if (currentViewMode === 'list') {
                const getSortIndicator = (col) => currentSort.column === col ? (currentSort.direction === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : '';
                htmlStr += `
                <div class="dos-table-header">
                    <span class="dos-col-name sortable-header sound-trigger" onclick="toggleSort('name')">FILE_NAME<span style="color:var(--ibm-accent-blue); display:inline-block; width:12px;">${getSortIndicator('name')}</span></span>
                    <span class="dos-col-date sortable-header sound-trigger" onclick="toggleSort('date')">DATE_MODIFIED<span style="color:var(--ibm-accent-blue); display:inline-block; width:12px;">${getSortIndicator('date')}</span></span>
                    <span class="dos-col-size sortable-header sound-trigger" onclick="toggleSort('size')">SIZE<span style="color:var(--ibm-accent-blue); display:inline-block; width:12px;">${getSortIndicator('size')}</span></span>
                </div>`;

                sortedFiles.forEach(file => {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder' || file.name.endsWith('[FOLDER]'); 
                    const dateStr = formatDOSDate(file.createdTime);
                    const sizeStr = formatDOSSize(file.size);
                    const safeName = escapeHtml(file.name);
                    const thumb = safeUrl(file.thumbnailLink);

                    let clickAction = fileClickAttrs(file, isFolder);
                    let iconHtml = isFolder ? `<div class="file-icon" style="background:var(--ibm-key-dark); color:#fff; flex:none;">${svgIcon('folder')}</div>` : 
                                   (file.hasThumbnail && thumb ? `<img src="${escapeHtml(thumb)}" class="file-thumb" style="flex:none;" loading="lazy" referrerpolicy="no-referrer" alt="">` : `<div class="file-icon" style="flex:none;">${svgIcon('file')}</div>`);
                    
                    htmlStr += `
                    <div class="file-item sound-trigger" ${clickAction} style="cursor: pointer; display: flex; align-items: center;">
                        <div class="file-info">
                            ${iconHtml}
                            <span class="dos-col-name" style="text-overflow: ellipsis;">
                                <a class="file-link" style="display:inline; text-decoration:none;">${safeName}</a>
                            </span>
                        </div>
                        <span class="dos-col-date" style="color:var(--ibm-shadow); font-family: 'VT323'; font-size: 1.1rem;">${dateStr}</span>
                        <span class="dos-col-size" style="color:var(--ibm-shadow); font-family: 'VT323'; font-size: 1.1rem;">${sizeStr}</span>
                    </div>`;
                });
            } else {
                htmlStr += `<div class="grid-container">`;
                sortedFiles.forEach(file => {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder' || file.name.endsWith('[FOLDER]'); 
                    const safeName = escapeHtml(file.name);
                    const thumb = safeUrl(file.thumbnailLink);
                    let clickAction = fileClickAttrs(file, isFolder);
                    let iconHtml = isFolder ? `<div class="file-icon" style="color:var(--ibm-accent-blue); background:transparent; border:none;">${svgIcon('folder')}</div>` : 
                                   (file.hasThumbnail && thumb ? `<img src="${escapeHtml(thumb)}" class="file-thumb" loading="lazy" referrerpolicy="no-referrer" alt="">` : `<div class="file-icon" style="color:var(--ibm-text); background:transparent; border:none;">${svgIcon('file')}</div>`);
                    htmlStr += `
                    <div class="grid-item sound-trigger" ${clickAction} title="${safeName}">
                        ${iconHtml}
                        <span class="file-link">${safeName}</span>
                    </div>`;
                });
                htmlStr += `</div>`;
            }
            fileListDiv.innerHTML = htmlStr;
        }

        window.enterFolder = function(folderId, folderName) { folderHistory.push({ id: folderId, name: folderName }); currentFolderId = folderId; updatePathDisplay(); fetchFiles(currentFolderId); }
        window.jumpToFolder = function(index) { folderHistory = folderHistory.slice(0, index + 1); currentFolderId = folderHistory[folderHistory.length - 1].id; updatePathDisplay(); fetchFiles(currentFolderId); }
        window.goBackFolder = function() { if (folderHistory.length > 1) { jumpToFolder(folderHistory.length - 2); } }

        function updatePathDisplay() {
            const pathContainer = document.getElementById('archive-path');
            let breadcrumbsHtml = `<span style="color: var(--ibm-key-dark); font-family: 'VT323';">C:\\ARCHIVE</span>`;
            folderHistory.forEach((f, index) => {
                breadcrumbsHtml += `<span style="margin: 0 8px; color: var(--ibm-key-dark);">></span>`;
                breadcrumbsHtml += `<a class="sound-trigger" style="color: #fff; font-family: 'VT323'; text-decoration: none; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='var(--ibm-accent-blue)'; this.style.textDecoration='underline';" onmouseout="this.style.color='#fff'; this.style.textDecoration='none';" onclick="jumpToFolder(${index})">${escapeHtml(f.name)}</a>`;
            });
            pathContainer.innerHTML = breadcrumbsHtml;
        }

        window.filterFiles = function() { const keyword = document.getElementById('search-input').value.toLowerCase(); renderFilesList(allFiles.filter(file => file.name.toLowerCase().includes(keyword))); }

        // 5. ระบบ Calendar
        function renderCalendar() {
            const grid = document.getElementById('calendar-grid'); const monthYearLabel = document.getElementById('month-year-label');
            if(!grid) return;
            grid.innerHTML = ''; monthYearLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
            ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach(day => { const el = document.createElement('div'); el.className = 'calendar-day-header'; el.textContent = day; grid.appendChild(el); });

            const firstDay = new Date(currentYear, currentMonth, 1).getDay(); const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
            for (let i = 0; i < firstDay; i++) { const empty = document.createElement('div'); empty.className = 'calendar-day empty'; grid.appendChild(empty); }

            for (let day = 1; day <= daysInMonth; day++) {
                const cell = document.createElement('div'); cell.className = 'calendar-day';
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = scheduleData.filter(e => e.date === dateStr); const activeEvents = dayEvents.filter(e => !e.completed);
                const pinIcon = activeEvents.length > 0 ? ' <span style="font-size: 1rem;">📌</span>' : '';
                cell.innerHTML = `<div class="day-number">${day}${pinIcon}</div>`;
                
                const eventsContainer = document.createElement('div'); eventsContainer.className = 'events-container';
                dayEvents.forEach(ev => {
                    const globalIndex = scheduleData.indexOf(ev); const evEl = document.createElement('div');
                    evEl.className = 'calendar-event' + (ev.completed ? ' completed' : '');
                    const textSpan = document.createElement('span'); textSpan.textContent = `> ${decodeEntities(ev.title)}`;
                    textSpan.onclick = (e) => { if(document.body.classList.contains('edit-mode')) { e.stopPropagation(); toggleQuest(globalIndex); } };
                    evEl.appendChild(textSpan);
                    const delBtn = document.createElement('button'); delBtn.className = 'delete-event-btn sound-trigger'; delBtn.textContent = 'x';
                    delBtn.onclick = (e) => { e.stopPropagation(); deleteScheduleEvent(globalIndex); };
                    evEl.appendChild(delBtn); eventsContainer.appendChild(evEl);
                });
                cell.appendChild(eventsContainer); cell.onclick = () => { if(document.body.classList.contains('edit-mode')) promptAddEvent(dateStr); }; grid.appendChild(cell);
            }
            renderAgenda();
        }

        // มุมมองแบบรายการสำหรับมือถือ: งานของเดือนที่เลือก เรียงตามวัน
        const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'], EN_DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        function renderAgenda() {
            const box = document.getElementById('calendar-agenda');
            if (!box) return;
            const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-`;
            const todayStr = new Date().toLocaleDateString('en-CA');
            const items = scheduleData.map((ev, i) => ({ ev, i })).filter(x => String(x.ev.date).startsWith(prefix))
                .sort((a, b) => a.ev.date.localeCompare(b.ev.date));
            box.replaceChildren();
            if (!items.length) {
                const empty = document.createElement('div'); empty.className = 'agenda-empty'; empty.textContent = '> NO TASKS THIS MONTH.';
                box.appendChild(empty); return;
            }
            items.forEach(({ ev, i }) => {
                const d = new Date(ev.date + 'T00:00:00');
                const row = document.createElement('div');
                row.className = 'agenda-item' + (ev.date < todayStr ? ' past' : '') + (ev.completed ? ' done' : '');
                const date = document.createElement('div'); date.className = 'agenda-date';
                const day = document.createElement('b'); day.textContent = d.getDate();
                const dow = document.createElement('span'); dow.textContent = (lang === 'en' ? EN_DOW : TH_DOW)[d.getDay()];
                date.append(day, dow);
                const title = document.createElement('div'); title.className = 'agenda-title';
                title.textContent = decodeEntities(ev.title) + (ev.date === todayStr ? '  ' + t('today') : '');
                if (document.body.classList.contains('edit-mode')) { title.style.cursor = 'pointer'; title.onclick = () => toggleQuest(i); }
                row.append(date, title);
                box.appendChild(row);
            });
        }
        window.changeMonth = function(dir) { currentMonth += dir; if(currentMonth < 0) { currentMonth = 11; currentYear--; } if(currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); }
        window.toggleQuest = function(index) { scheduleData[index].completed = !scheduleData[index].completed; if(scheduleData[index].completed) playLevelUpSound(); renderCalendar(); if(document.body.classList.contains('edit-mode')){ document.getElementById('save-btn').click(); } }
        const CAL_TYPES = [['📝', 'สอบ'], ['📌', 'ส่งงาน'], ['👥', 'นัดหมาย'], ['🎉', 'กิจกรรม'], ['⏰', 'เตือน']];
        let calDate = null, calType = '';
        window.promptAddEvent = function(dateStr) {
            calDate = dateStr; calType = '';
            const d = new Date(dateStr + 'T00:00:00');
            document.getElementById('cal-date-label').textContent = `DATE: ${d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
            document.getElementById('cal-title').value = ''; document.getElementById('cal-time1').value = ''; document.getElementById('cal-time2').value = '';
            drawCalTypes();
            document.getElementById('cal-modal').style.display = 'flex';
            document.getElementById('cal-title').focus();
        }
        function drawCalTypes() {
            const box = document.getElementById('cal-quick'); box.replaceChildren();
            CAL_TYPES.forEach(([emo, name]) => { const b = el('button', calType === emo ? 'on' : '', `${emo} ${name}`); b.type = 'button'; b.addEventListener('click', () => { calType = calType === emo ? '' : emo; drawCalTypes(); document.getElementById('cal-title').focus(); }); box.appendChild(b); });
        }
        function initCalModal() {
            const close = () => { document.getElementById('cal-modal').style.display = 'none'; };
            document.getElementById('cal-cancel').addEventListener('click', close);
            document.getElementById('cal-modal').addEventListener('click', (e) => { if (e.target.id === 'cal-modal') close(); });
            document.getElementById('cal-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const text = document.getElementById('cal-title').value.trim(); if (!text || !calDate) return;
                const t1 = document.getElementById('cal-time1').value, t2 = document.getElementById('cal-time2').value;
                const title = `${calType ? calType + ' ' : ''}${text}${t1 ? ' · ' + t1 + (t2 ? '-' + t2 : '') : ''}`.slice(0, 200);
                scheduleData.push({ date: calDate, title, completed: false }); renderCalendar(); sendLineNotify(calDate, title);
                close(); document.getElementById('save-btn').click();
            });
        }
        window.deleteScheduleEvent = function(index) { if(confirm("DELETE THIS TASK? (Y/N)")) { scheduleData.splice(index, 1); renderCalendar(); if(document.body.classList.contains('edit-mode')){ document.getElementById('save-btn').click(); } } }

        // 6. ระบบ Gallery & Tab Navigation
        // MEMORIES: การ์ดอัลบั้ม (จาก Drive) + หน้าต่างดูอัลบั้ม
        function memDate(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `'${m[1].slice(2)} ${m[2]} ${m[3]}` : ''; }
        let memAlbums = [];
        async function loadMemories() {
            const grid = document.getElementById('mem-grid'); if (!grid) return;
            try {
                const r = await fetch(`${SERVER_URL}/memories`); if (!r.ok) throw new Error(r.status);
                const list = await r.json();
                memAlbums = Array.isArray(list) ? list.filter(a => a && /^[A-Za-z0-9_-]{10,128}$/.test(a.id)) : [];
            } catch (e) { memAlbums = []; grid.innerHTML = '<p class="agenda-empty">> ERROR: โหลดอัลบั้มไม่สำเร็จ ลองรีเฟรชอีกครั้ง</p>'; return; }
            grid.replaceChildren();
            if (!memAlbums.length) { const p = document.createElement('p'); p.className = 'agenda-empty'; p.textContent = '> NO ALBUMS YET.'; grid.appendChild(p); return; }
            memAlbums.forEach(al => {
                const card = document.createElement('button'); card.type = 'button'; card.className = 'mem-card sound-trigger';
                card.setAttribute('aria-label', `เปิดอัลบั้ม ${al.title}`);
                card.innerHTML = '<div class="mem-cover"><img alt="" loading="lazy"><span class="mem-stamp"></span></div><h3 class="mem-title"></h3><p class="mem-desc"></p><div class="mem-meta"><span class="count"></span><span class="open">OPEN ▶</span></div>';
                card.querySelector('img').src = photoUrl(al.cover, 800);
                card.querySelector('.mem-stamp').textContent = memDate(al.date);
                card.querySelector('.mem-title').textContent = al.title;
                card.querySelector('.mem-desc').textContent = al.desc || '';
                card.querySelector('.count').innerHTML = `${svgIcon('camera')} ${Number(al.count) || 0} PHOTOS`;
                card.addEventListener('mousedown', playRetroClick);
                card.addEventListener('click', () => openAlbum(al));
                grid.appendChild(card);
            });
        }
        async function openAlbum(al) {
            const view = document.getElementById('album-view');
            view.replaceChildren();
            const head = document.createElement('div'); head.className = 'album-head';
            head.innerHTML = '<h3></h3><div class="meta"></div><p></p>';
            head.querySelector('h3').textContent = al.title;
            head.querySelector('.meta').textContent = `${memDate(al.date)}  ·  ${al.count} PHOTOS`;
            head.querySelector('p').textContent = al.desc || '';
            const grid = document.createElement('div'); grid.className = 'album-masonry';
            grid.innerHTML = '<p class="agenda-empty" style="color:#c6c6c6">> LOADING...</p>';
            view.append(head, grid);
            document.getElementById('galleryModal').classList.add('active');
            document.body.style.overflow = 'hidden';
            document.getElementById('galleryModal').scrollTop = 0;
            try {
                const r = await fetch(`${SERVER_URL}/memories/${encodeURIComponent(al.id)}`); if (!r.ok) throw new Error(r.status);
                const photos = (await r.json()).filter(p => p && /^[A-Za-z0-9_-]{10,128}$/.test(p.id));
                grid.replaceChildren();
                photos.forEach((p, i) => {
                    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `ภาพที่ ${i + 1}`);
                    const im = document.createElement('img'); im.loading = 'lazy'; im.alt = p.caption || '';
                    if (p.w && p.h) { im.width = p.w; im.height = p.h; }
                    im.src = photoUrl(p.id, 800);
                    b.appendChild(im); b.addEventListener('click', () => lbOpen(photos, i));
                    grid.appendChild(b);
                });
            } catch (e) { grid.innerHTML = '<p class="agenda-empty" style="color:#ff8389">> ERROR: โหลดรูปไม่สำเร็จ</p>'; }
        }
        window.closeGallery = function() { document.getElementById('galleryModal').classList.remove('active'); document.body.style.overflow = ''; }
        // เปลี่ยนหน้า + จำไว้ใน URL (#about ฯลฯ) ให้ปุ่ม Back ใช้ได้และส่งลิงก์ตรงหน้าได้
        const TABS = ['home', 'schedule', 'archive', 'about', 'contact', 'client'];
        function showTab(tabId) {
            if (!TABS.includes(tabId)) tabId = 'home';
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', (b.getAttribute('onclick') || '').includes(`'${tabId}'`)));
            document.getElementById(tabId).classList.add('active');
            if (tabId === 'about') onProfileShown();
            window.scrollTo(0, 0);
            // หน้า DATABASE: เปิดโฟลเดอร์แรกให้อัตโนมัติ แทนหน้าว่าง
            if (tabId === 'archive' && folderHistory.length === 0) {
                const first = document.querySelector('.archive-sidebar .folder-btn');
                if (first) first.click();
            }
        }
        window.switchTab = function(e, tabId) {
            if (('#' + tabId) !== location.hash) {
                history.pushState(null, '', tabId === 'home' ? location.pathname + location.search : '#' + tabId);
            }
            showTab(tabId);
        }
        window.addEventListener('popstate', () => showTab(location.hash.slice(1)));
        window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

        // 7. เสียงเอฟเฟกต์: เอาออกแล้ว (เหลือฟังก์ชันว่างไว้ เพราะยังมีจุดเรียกใช้อยู่หลายที่)
        window.playRetroClick = function() {};
        window.playLevelUpSound = function() {};
        try { localStorage.removeItem('peem_muted'); } catch (e) {}

        // 8. Event Listeners เบ็ดเตล็ดเมื่อเปิดหน้าเว็บ
        document.addEventListener('DOMContentLoaded', () => {

            document.addEventListener('keydown', function(event) { 
                if (event.key === 'Enter') { 
                    if (event.target.classList.contains('editable-block') || event.target.classList.contains('project-desc')) { 
                        event.preventDefault(); document.execCommand('insertLineBreak'); 
                    } else if (event.target.classList.contains('editable') || event.target.classList.contains('project-title') || event.target.classList.contains('proj-url-edit')) { 
                        event.preventDefault(); event.target.blur(); 
                    } 
                } 
            });
            document.querySelectorAll('.editable:not(.editable-block)').forEach(el => { 
                el.addEventListener('blur', function() { let cleanText = this.innerText.replace(/\s+/g, ' ').trim(); this.textContent = cleanText; }); 
            });

            // Enter สำหรับ Login แอดมิน
            const pwInput = document.getElementById('password');
            if(pwInput) pwInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') { document.getElementById('login-submit-btn').click(); } });

            // ==========================================
            // ระบบฟอร์มล็อกอิน (ปรับปรุงเรื่อง Auto-fill)
            // ==========================================
            
            // 1. แอดมินล็อกอิน
            const rootLoginForm = document.getElementById('root-login-form');
            if(rootLoginForm) {
                rootLoginForm.onsubmit = async (e) => { 
                    e.preventDefault(); // กันไม่ให้หน้าเว็บรีเฟรช
                    try { 
                        await loadFirebase(); await firebase.auth().signInWithEmailAndPassword(document.getElementById('email').value.trim(), document.getElementById('password').value); 
                        document.getElementById('login-modal').style.display = 'none'; 
                        alert("SYSTEM ACCESS GRANTED"); 
                    } catch (error) { 
                        alert("ACCESS DENIED: " + error.message); 
                        console.error("Firebase Auth Error:", error); 
                    } 
                };
            }

            // 2. สร้างยูสเซอร์ใหม่ (แอดมินเท่านั้น)
            const createUserForm = document.getElementById('create-user-form');
            if(createUserForm) {
                createUserForm.onsubmit = async (e) => {
                    e.preventDefault();
                    const studentId = document.getElementById('new-user-email').value.trim();
                    const pwd = document.getElementById('new-user-password').value;
                    const btn = document.getElementById('create-user-submit-btn');

                    if(!/^\d{10}$/.test(studentId)) {
                        alert("ERROR: กรุณากรอกรหัสนักศึกษาเป็นตัวเลข 10 หลักให้ถูกต้อง");
                        return;
                    }
                    if(pwd.length < 8) {
                        alert("ERROR: รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร");
                        return;
                    }

                    try {
                        btn.innerText = "CREATING...";
                        // สร้างบัญชีผ่าน backend (ตรวจสิทธิ์แอดมินฝั่งเซิร์ฟเวอร์) — ปิดการสมัครเองใน Firebase ได้
                        const currentUser = fbUser();
                        if (!currentUser) throw new Error('กรุณาล็อกอินแอดมินก่อน');
                        const res = await fetch(`${SERVER_URL}/create-user`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await currentUser.getIdToken()}` },
                            body: JSON.stringify({ studentId, password: pwd })
                        });
                        const out = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);

                        alert("✅ สร้างบัญชีผู้ใช้สำหรับรหัส " + studentId + " สำเร็จแล้ว!\nให้นักศึกษานำรหัสนักศึกษานี้ไปล็อกอินโฟลเดอร์ TOP SECRET ได้เลย");
                        document.getElementById('create-user-modal').style.display = 'none';
                        btn.innerText = "REGISTER USER";
                    } catch (error) {
                        alert("FAILED TO CREATE USER: " + error.message);
                        btn.innerText = "REGISTER USER";
                    }
                }
            }

            // 3. ระบบล็อกอินโฟลเดอร์ลับ (นักศึกษา)
            const secretLoginForm = document.getElementById('secret-login-form');
            if(secretLoginForm) {
                secretLoginForm.onsubmit = async (e) => {
                    e.preventDefault();
                    const studentId = document.getElementById('secret-email').value.trim();
                    const pwd = document.getElementById('secret-password').value;
                    
                    if(!/^\d{10}$/.test(studentId)) {
                        alert("ACCESS DENIED: กรุณากรอกรหัสนักศึกษาเป็นตัวเลข 10 หลักให้ถูกต้อง");
                        return;
                    }
                    
                    const email = `${studentId}@dome.tu.ac.th`;
                    
                    try {
                        await loadFirebase(); const userCredential = await firebase.auth().signInWithEmailAndPassword(email, pwd);
                        const user = userCredential.user;
                        
                        document.getElementById('secret-modal').style.display = 'none';
                        playLevelUpSound();
                        
                        if (user.email !== 'peemdiamond@gmail.com') {
                            sendLineNotify(new Date().toLocaleDateString('en-CA'), `🚨 นักศึกษา ${studentId} ปลดล็อกเข้าดูโฟลเดอร์ TOP SECRET`);
                        }
                        
                        if(targetSecretBtn) loadDriveFolder(targetSecretBtn, 'TOP_SECRET', SECRET_FOLDER_ID);
                        
                    } catch (error) {
                        alert("ACCESS DENIED: รหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ลงทะเบียน");
                        document.getElementById('secret-password').value = '';
                    }
                };
            }
            
            initMatrix();

            // ---- UX ----
            document.getElementById('award-modal').addEventListener('click', (e) => { if (e.target.id === 'award-modal' || e.target.closest('.award-close')) closeAward(); });
            const topbar = document.getElementById('topbar');
            const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 8);
            window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
            // ค่อยๆ แสดงแต่ละส่วนเมื่อเลื่อนมาถึง (ปิดเองถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว)
            if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const rio = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); rio.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
                document.querySelectorAll('.block, .cta-band, .devlog').forEach(x => { x.classList.add('reveal'); rio.observe(x); });
            }
            document.getElementById('term-open-link').addEventListener('click', openTerm);
            document.addEventListener('keydown', (e) => {
                const inTerm = document.activeElement && document.activeElement.id === 'term-in';
                const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]');
                if (e.key === '`' && (inTerm || !typing)) { e.preventDefault(); document.getElementById('term').classList.contains('open') ? closeTerm() : openTerm(); }
            });
            document.getElementById('term-in').addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                const raw = e.target.value.trim(); e.target.value = ''; if (!raw) return;
                termSay('C:\\PEEMCN25> ' + raw);
                const [cmd, ...args] = raw.split(/\s+/);
                const fn = TERM_CMDS[cmd.toLowerCase()];
                const out = fn ? fn(args.join(' ')) : `'${raw}' is not recognized. type "help"`;
                if (out) termSay(out);
            });
            renderSkills(false);
            loadVisitCount();
            initPhotos();
            loadMemories();
            initBooking();
            initBusinessCard();
            initReviewForm();
            initCalModal();
            if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
            initClient();
            initUrlInputs();
            document.getElementById('hero-busy-toggle').addEventListener('change', (e) => { document.getElementById('hero-busy').textContent = e.target.checked ? '1' : ''; renderHeroBusy(); });
            document.getElementById('rev-add').addEventListener('click', () => { if (!revEditList) revEditList = revParse(); revEditList.push({ who: '', stars: 5, text: '', job: '' }); renderReviewEditor(); const rows = document.querySelectorAll('.rev-row'); rows[rows.length - 1]?.querySelector('input')?.focus(); });
            applyLang();
            // ความสูงแถบเมนู → ใช้กับ scroll-margin-top ให้หัวข้อไม่โดนบังตอนเปิดลิงก์ #...
            const navEl = document.querySelector('.navbar');
            const syncNavH = () => document.documentElement.style.setProperty('--nav-h', navEl.offsetHeight + 'px');
            syncNavH(); window.addEventListener('resize', syncNavH);
            // มือถือ: เลื่อนปุ่มเมนูที่เลือกให้อยู่ในจอ
            document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => b.scrollIntoView({ block: 'nearest', inline: 'nearest' })));


            // อีเมล/เบอร์โทร กดแล้วเปิดแอปอีเมล/โทรออกได้ (ยกเว้นตอนแอดมินกำลังแก้)
            const contactAction = (el, makeHref) => {
                const go = () => { if (document.body.classList.contains('edit-mode')) return; const v = el.innerText.trim(); if (v) location.href = makeHref(v); };
                el.addEventListener('click', go);
                el.addEventListener('keydown', e => { if (e.key === 'Enter' && !document.body.classList.contains('edit-mode')) go(); });
            };
            contactAction(document.getElementById('contact-email'), v => 'mailto:' + encodeURIComponent(v).replace('%40', '@'));
            contactAction(document.getElementById('contact-tel'), v => 'tel:' + v.replace(/[^\d+]/g, ''));

            // ปฏิทิน: สลับ รายการ/ตาราง บนมือถือ
            document.getElementById('cal-view-toggle').addEventListener('click', (e) => {
                const grid = document.body.classList.toggle('cal-grid-mode');
                e.currentTarget.textContent = grid ? '[ VIEW: LIST ]' : '[ VIEW: GRID ]';
            });

            // แกลเลอรี: คลิกพื้นหลังเพื่อปิด
            document.getElementById('galleryModal').addEventListener('click', (e) => { if (e.target.id === 'galleryModal') closeGallery(); });

            // Esc ปิดหน้าต่างที่เปิดอยู่
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                if (document.getElementById('award-modal').classList.contains('open')) { closeAward(); return; }
                if (document.getElementById('photo-lightbox').classList.contains('open')) { photoLightbox(false); return; }
                document.getElementById('cal-modal').style.display = 'none';
                closeGallery(); closePreview(); closeTerm();
                ['login-modal', 'create-user-modal', 'secret-modal'].forEach(id => { document.getElementById(id).style.display = 'none'; });
            });


            // เปิดหน้าตาม URL (#about ฯลฯ)
            // รอให้ Firebase ตั้งค่าเสร็จก่อน (ตั้งใน DOMContentLoaded ตัวถัดไป)
            if (location.hash) setTimeout(() => showTab(location.hash.slice(1)), 0);
        });

        // 9. Profile: แถบทักษะ (จากข้อความที่แอดมินแก้ได้) + ตัวเลขนับขึ้น
        // อ่านบรรทัดทักษะจาก HTML ตรงๆ (innerText ของ element ที่ซ่อนอยู่จะไม่แยกบรรทัดตาม <br>)
        function skillLines() {
            const src = document.getElementById('skills-src'); if (!src) return [];
            const html = src.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n');
            return (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').split('\n').map(l => l.trim()).filter(Boolean);
        }
        function renderSkills(animate) {
            const src = document.getElementById('skills-src'), box = document.getElementById('skill-bars');
            if (!src || !box) return;
            box.replaceChildren();
            skillLines().slice(0, 12).forEach(line => {
                const m = /^(.*?)[\s:]+(\d{1,3})\s*%?$/.exec(line);
                const name = m ? m[1].trim() : line, pct = m ? Math.min(100, +m[2]) : 0;
                const row = document.createElement('div'); row.className = 'skill-row';
                const n = document.createElement('span'); n.textContent = name;
                const bar = document.createElement('span'); bar.className = 'bar';
                const p = document.createElement('span'); p.className = 'pct'; p.textContent = pct + '%';
                row.append(n, bar, p); box.appendChild(row);
                const fill = document.createElement('span'); bar.appendChild(fill);
                if (!animate) { fill.style.transition = 'none'; fill.style.width = pct + '%'; return; }
                requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + '%'; }));
            });
        }
        function animateStats() {
            if (document.body.classList.contains('edit-mode')) return;
            document.querySelectorAll('.stat-num').forEach(el => {
                const to = parseInt(el.textContent, 10); if (!(to > 0) || to > 999) return;
                let n = 0; const step = Math.max(1, Math.ceil(to / 20));
                const t = setInterval(() => { n = Math.min(to, n + step); el.textContent = n; if (n >= to) clearInterval(t); }, 50);
            });
        }
        let profileAnimated = false;
        function onProfileShown() {
            if (profileAnimated) { renderSkills(false); return; }
            profileAnimated = true; renderSkills(true); animateStats();
        }

        try { localStorage.removeItem('peem_crt'); } catch (e) {}
        // 9c. Terminal (easter egg)
        const TERM_TABS = { home: 'home', projects: 'projects', schedule: 'schedule', files: 'archive', archive: 'archive', about: 'about', contact: 'contact' };
        function termVisibleProjects() { return projectData.filter(p => { const l = safeUrl(p.url); return l && l !== 'https:///' && p.name !== 'NEW_PROJECT.EXE'; }); }
        const TERM_CMDS = {
            help: () => (lang === 'en' ? 'Commands' : 'คำสั่ง') + ': help · whoami · projects · open <n> · skills · goto <home|projects|schedule|files|about|contact> · date · clear · exit',
            whoami: () => 'PEEM — Computer Engineering student · builds web, games & IoT',
            projects: () => termVisibleProjects().map((p, i) => `[${i + 1}] ${String(p.name).padEnd(22)} ${safeUrl(p.url)}`).join('\n') || 'NO PROJECTS.',
            open: (a) => { const p = termVisibleProjects()[parseInt(a, 10) - 1]; if (!p) return 'usage: open <number>  (ดูเลขจาก "projects")'; window.open(safeUrl(p.url), '_blank', 'noopener'); return 'OPENING ' + p.name + ' ...'; },
            skills: () => skillLines().map(l => { const m = /^(.*?)[\s:]+(\d{1,3})\s*%?$/.exec(l); if (!m) return l; const v = Math.min(100, +m[2]); return `${m[1].trim().padEnd(14)} ${'█'.repeat(Math.round(v / 10))}${'░'.repeat(10 - Math.round(v / 10))} ${v}%`; }).join('\n'),
            goto: (a) => { const t = TERM_TABS[String(a || '').toLowerCase()]; if (!t) return 'usage: goto <home|projects|schedule|files|about|contact>'; if (t === 'projects') goProjects(null); else switchTab(null, t); return 'CD ' + t.toUpperCase(); },
            date: () => new Date().toString(),
            clear: () => { document.getElementById('term-out').textContent = ''; return null; },
            exit: () => { closeTerm(); return null; },
            sudo: () => 'nice try. 😏 this incident will be reported.',
        };
        function termSay(t) { const o = document.getElementById('term-out'); o.textContent += t + '\n'; o.scrollTop = o.scrollHeight; }
        function openTerm() { const t = document.getElementById('term'); t.classList.add('open'); if (!document.getElementById('term-out').textContent) termSay('PEEMCN25 DOS v2.5 — type "help"'); document.getElementById('term-in').focus(); }
        function closeTerm() { document.getElementById('term').classList.remove('open'); }

        // 9d. ตัวนับผู้เข้าชม (นับผ่าน backend วันละครั้งต่อเบราว์เซอร์)
        async function loadVisitCount() {
            const el = document.getElementById('visit-count'); if (!el) return;
            let first = false;
            try { const today = new Date().toLocaleDateString('en-CA'); first = localStorage.getItem('peem_visit') !== today; if (first) localStorage.setItem('peem_visit', today); } catch (e) {}
            try {
                const r = await fetch(`${SERVER_URL}/views`, { method: first ? 'POST' : 'GET' });
                if (!r.ok) throw new Error();
                const d = await r.json();
                el.textContent = String(Math.max(0, parseInt(d.count, 10) || 0)).padStart(6, '0');
            } catch (e) { el.parentElement.style.display = 'none'; }
        }

        // 9e. โชว์ภาพถ่าย: สไลด์อัตโนมัติจากโฟลเดอร์ Google Drive
        const PHOTO_INTERVAL = 5000;
        const photoState = { list: [], i: 0, timer: null, started: 0, paused: false, hover: false, visible: true };
        const photoUrl = (id, w) => `${SERVER_URL}/photo/${encodeURIComponent(id)}?w=${w}&v=2`;
        function photoShow(i, user) {
            const st = photoState, n = st.list.length; if (!n) return;
            st.i = (i + n) % n;
            const p = st.list[st.i];
            const stage = document.getElementById('photo-stage');
            const bg = document.createElement('img'); bg.className = 'bg'; bg.alt = ''; bg.src = photoUrl(p.id, 400);
            const fg = document.createElement('img'); fg.className = 'fg'; fg.alt = p.caption || `ภาพที่ ${st.i + 1}`; fg.src = photoUrl(p.id, 1600);
            const reveal = () => { [bg, fg].forEach(x => x.classList.add('on')); [...stage.children].forEach(old => { if (old !== bg && old !== fg) { old.classList.remove('on'); setTimeout(() => old.remove(), 1000); } }); };
            stage.append(bg, fg);
            if (fg.complete) requestAnimationFrame(reveal); else { fg.onload = reveal; fg.onerror = reveal; }
            document.getElementById('photo-caption').textContent = p.caption || '';
            document.getElementById('photo-count').textContent = `${String(st.i + 1).padStart(2, '0')}/${String(n).padStart(2, '0')}`;
            document.querySelectorAll('#photo-thumbs button').forEach((b, k) => { b.classList.toggle('on', k === st.i); if (k === st.i && user) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
            const nx = new Image(); nx.src = photoUrl(st.list[(st.i + 1) % n].id, 1600); // โหลดภาพถัดไปรอไว้
            st.started = performance.now();
        }
        function photoTick() {
            const st = photoState, bar = document.getElementById('photo-progress');
            const running = !st.paused && !st.hover && st.visible && !document.hidden && st.list.length > 1 && !document.getElementById('photo-lightbox').classList.contains('open');
            if (!running) { st.started = performance.now() - (parseFloat(bar.dataset.p || 0) * PHOTO_INTERVAL); return; }
            const p = Math.min(1, (performance.now() - st.started) / PHOTO_INTERVAL);
            bar.dataset.p = p; bar.style.width = (p * 100) + '%';
            if (p >= 1) { bar.dataset.p = 0; photoShow(st.i + 1); }
        }
        // ดูภาพเต็มจอ (ใช้ร่วมกันทั้งโชว์ภาพถ่ายและอัลบั้ม MEMORIES)
        const lbState = { list: [], i: 0 };
        function lbRender() {
            const p = lbState.list[lbState.i]; if (!p) return;
            const img = document.getElementById('photo-lightbox-img');
            img.src = p.client ? clientPhotoUrl(p.id, 2000) : photoUrl(p.id, 2000); img.alt = p.caption || '';
            const dl = document.getElementById('photo-lb-dl'); dl.hidden = !p.client; if (p.client) { dl.href = clientDlUrl(p.id); dl.setAttribute('download', ''); }
            const n = lbState.list.length;
            document.getElementById('photo-lb-caption').textContent = (p.caption ? p.caption + '  ·  ' : '') + `${lbState.i + 1} / ${n}`;
            if (n > 1) { const q = lbState.list[(lbState.i + 1) % n]; const nx = new Image(); nx.src = q.client ? clientPhotoUrl(q.id, 2000) : photoUrl(q.id, 2000); }
        }
        function lbOpen(list, i) { lbState.list = list; lbState.i = i; lbRender(); document.getElementById('photo-lightbox').classList.add('open'); }
        function lbStep(d) { const n = lbState.list.length; if (!n) return; lbState.i = (lbState.i + d + n) % n; lbRender(); }
        function photoLightbox(open) {
            if (!open) { document.getElementById('photo-lightbox').classList.remove('open'); return; }
            if (photoState.list.length) lbOpen(photoState.list, photoState.i);
        }
        async function loadPhotos() {
            const sec = document.getElementById('photo-section');
            try {
                const r = await fetch(`${SERVER_URL}/photos`); if (!r.ok) throw new Error(r.status);
                const list = await r.json();
                photoState.list = Array.isArray(list) ? list.filter(p => p && /^[A-Za-z0-9_-]{10,128}$/.test(p.id)) : [];
            } catch (e) { photoState.list = []; }
            photoAll = photoState.list.slice(); photoCat = '';
            rebuildPhotoThumbs(); renderPhotoCats();
            document.getElementById('photo-show').style.display = photoState.list.length ? '' : 'none';
            sec.style.display = (photoState.list.length || document.body.classList.contains('edit-mode')) ? '' : 'none';
            if (photoState.list.length) photoShow(0);
        }
        function rebuildPhotoThumbs() {
            const thumbs = document.getElementById('photo-thumbs'); thumbs.replaceChildren();
            photoState.list.forEach((p, k) => {
                const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `ภาพที่ ${k + 1}`);
                const im = document.createElement('img'); im.loading = 'lazy'; im.alt = ''; im.src = photoUrl(p.id, 200);
                b.appendChild(im); b.addEventListener('click', () => { photoShow(k, true); }); thumbs.appendChild(b);
            });
        }
        function initPhotos() {
            const show = document.getElementById('photo-show'); if (!show) return;
            document.getElementById('photo-prev').addEventListener('click', () => photoShow(photoState.i - 1, true));
            document.getElementById('photo-next').addEventListener('click', () => photoShow(photoState.i + 1, true));
            document.getElementById('photo-play').addEventListener('click', (e) => { photoState.paused = !photoState.paused; e.currentTarget.textContent = photoState.paused ? '▶' : '❚❚'; e.currentTarget.setAttribute('aria-label', photoState.paused ? 'เล่นสไลด์' : 'หยุดสไลด์'); });
            document.getElementById('photo-stage').addEventListener('click', () => photoLightbox(true));
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) { photoState.paused = true; document.getElementById('photo-play').textContent = '▶'; }
            show.addEventListener('focusin', () => photoState.hover = true);
            show.addEventListener('focusout', () => photoState.hover = false);
            show.addEventListener('mouseenter', () => photoState.hover = true);
            show.addEventListener('mouseleave', () => photoState.hover = false);
            show.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') photoShow(photoState.i - 1, true); if (e.key === 'ArrowRight') photoShow(photoState.i + 1, true); });
            let sx = null; // ปัดซ้าย-ขวาบนมือถือ
            show.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
            show.addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) photoShow(photoState.i + (dx < 0 ? 1 : -1), true); });
            new IntersectionObserver(es => es.forEach(en => photoState.visible = en.isIntersecting), { threshold: 0.2 }).observe(show);
            document.getElementById('photo-lb-close').addEventListener('click', () => photoLightbox(false));
            document.getElementById('photo-lb-prev').addEventListener('click', () => lbStep(-1));
            document.getElementById('photo-lb-next').addEventListener('click', () => lbStep(1));
            document.getElementById('photo-lightbox').addEventListener('click', (e) => { if (e.target.id === 'photo-lightbox') photoLightbox(false); });
            document.addEventListener('keydown', (e) => {
                if (!document.getElementById('photo-lightbox').classList.contains('open')) return;
                if (e.key === 'ArrowLeft') lbStep(-1);
                if (e.key === 'ArrowRight') lbStep(1);
            });
            // ปัดซ้าย-ขวาในโหมดเต็มจอ
            let lx = null; const lbEl = document.getElementById('photo-lightbox');
            lbEl.addEventListener('touchstart', (e) => { lx = e.touches[0].clientX; }, { passive: true });
            lbEl.addEventListener('touchend', (e) => { if (lx === null) return; const dx = e.changedTouches[0].clientX - lx; lx = null; if (Math.abs(dx) > 40) lbStep(dx < 0 ? 1 : -1); });
            setInterval(photoTick, 100);
            loadPhotos();
        }

        // ================= 12. ส่วนที่แอดมินแก้เป็นข้อความ (แพ็กเกจ / รีวิว / devlog / ลิงก์) =================
        function srcText(id) {
            const el = document.getElementById(id); if (!el) return '';
            const html = el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n');
            return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
        }
        const srcLines = (id) => srcText(id).split('\n').map(l => l.trim()).filter(Boolean);
        const svgIcon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
        const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

        function renderPackages() {
            const grid = document.getElementById('pkg-grid'); if (!grid) return;
            grid.replaceChildren();
            const pkgs = srcLines('pkg-src').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).slice(0, 8);
            document.getElementById('packages-section').style.display = (pkgs.length || document.body.classList.contains('edit-mode')) ? '' : 'none';
            const sel = document.getElementById('book-type');
            const keep = sel.value; sel.replaceChildren();
            pkgs.forEach(([rawName, price, details]) => {
                const hot = /^★/.test(rawName), name = rawName.replace(/^★\s*/, '');
                const card = el('article', 'pkg' + (hot ? ' hot' : ''));
                if (hot) card.appendChild(el('span', 'pkg-badge', t('pkg_hot')));
                card.append(el('h3', '', name), el('div', 'price', price || t('pkg_ask')));
                const ul = el('ul'); (details || '').split(';').map(x => x.trim()).filter(Boolean).forEach(d => ul.appendChild(el('li', '', d)));
                card.appendChild(ul);
                const btn = el('button', 'action-btn sound-trigger', t('pkg_book')); btn.type = 'button';
                btn.addEventListener('click', () => bookPackage(name));
                card.appendChild(btn);
                grid.appendChild(card);
                sel.appendChild(new Option(name, name));
            });
            [t('type_other')].forEach(o => sel.appendChild(new Option(o, o)));
            if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
            renderRevJobTags();
        }
        function bookPackage(name) {
            switchTab(null, 'contact');
            const sel = document.getElementById('book-type');
            if ([...sel.options].some(o => o.value === name)) sel.value = name;
            setTimeout(() => { document.getElementById('book-form').scrollIntoView({ block: 'start' }); document.querySelector('#book-form [name=name]').focus({ preventScroll: true }); }, 60);
        }

        // ตัวแก้รีวิวสำหรับแอดมิน: กดดาวเลือกคะแนน แล้วเขียนกลับเป็นข้อความใน rev-src (รูปแบบเดิม: ชื่อ | ดาว | ข้อความ | งาน)
        function revParse() { return srcLines('rev-src').map(l => l.split('|').map(x => x.trim())).map(([who = '', stars = '5', text = '', job = '']) => ({ who, stars: Math.max(1, Math.min(5, parseInt(stars, 10) || 5)), text, job })); }
        function revWrite(list) {
            const clean = v => String(v || '').replace(/[|\n\r]+/g, ' / ').trim();
            const src = document.getElementById('rev-src');
            src.textContent = '';
            list.filter(r => r.who || r.text).forEach((r, i) => { if (i) src.appendChild(document.createElement('br')); src.appendChild(document.createTextNode([clean(r.who), r.stars, clean(r.text), clean(r.job)].join(' | '))); });
            renderReviews();
        }
        let revEditList = null; // รายการที่กำลังแก้ (เก็บแถวว่างที่เพิ่งกดเพิ่มไว้ด้วย)
        function renderReviewEditor() {
            const box = document.getElementById('rev-editor'); if (!box) return;
            if (!document.body.classList.contains('edit-mode')) { box.replaceChildren(); loadPendingReviews(); return; }
            if (!revEditList) revEditList = revParse();
            loadPendingReviews();
            const list = revEditList;
            box.replaceChildren();
            list.forEach((r, i) => {
                const row = el('div', 'rev-row');
                const top = el('div', 'top');
                const who = el('input'); who.placeholder = 'ชื่อลูกค้า'; who.value = r.who; who.maxLength = 60;
                const job = el('input'); job.placeholder = 'งานที่ถ่าย (ไม่ใส่ก็ได้)'; job.value = r.job; job.maxLength = 60;
                const stars = el('div', 'star-pick'); stars.setAttribute('role', 'radiogroup'); stars.setAttribute('aria-label', 'คะแนน');
                for (let n = 1; n <= 5; n++) {
                    const b = el('button', n <= r.stars ? 'on' : '', '★'); b.type = 'button'; b.title = `${n} ดาว`;
                    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(n === r.stars));
                    b.addEventListener('click', () => { list[i].stars = n; revWrite(list); renderReviewEditor(); });
                    stars.appendChild(b);
                }
                const del = el('button', 'del', 'X'); del.type = 'button'; del.title = 'ลบรีวิวนี้';
                del.addEventListener('click', () => { if (confirm('ลบรีวิวนี้?')) { list.splice(i, 1); revWrite(list); renderReviewEditor(); } });
                top.append(who, stars, job, del);
                const text = el('textarea'); text.rows = 2; text.placeholder = 'ข้อความรีวิว'; text.value = r.text; text.maxLength = 400;
                who.addEventListener('input', () => { list[i].who = who.value; revWrite(list); });
                job.addEventListener('input', () => { list[i].job = job.value; revWrite(list); });
                text.addEventListener('input', () => { list[i].text = text.value; revWrite(list); });
                row.append(top, text); box.appendChild(row);
            });
        }
        function renderReviews() {
            const grid = document.getElementById('rev-grid'); if (!grid) return;
            grid.replaceChildren();
            const revs = srcLines('rev-src').map(l => l.split('|').map(x => x.trim())).filter(r => r[0] && r[2]).slice(0, 12);
            document.getElementById('rev-empty').hidden = revs.length > 0;
            revs.forEach(([who, stars, text, job]) => {
                const n = Math.max(1, Math.min(5, parseInt(stars, 10) || 5));
                const card = el('figure', 'rev');
                const st = el('div', 'stars', '★'.repeat(n) + '☆'.repeat(5 - n)); st.setAttribute('aria-label', `${n} ดาว`);
                const who_ = el('figcaption', 'who', '— ' + who);
                if (job) { who_.appendChild(el('span', '', ' · ' + job)); }
                card.append(st, el('blockquote', '', text), who_);
                grid.appendChild(card);
            });
        }

        function renderDevlog() {
            const list = document.getElementById('devlog-list'); if (!list) return;
            list.replaceChildren();
            const posts = srcText('devlog-src').split(/\n\s*-{3,}\s*\n/).map(x => x.trim()).filter(Boolean).slice(0, 30);
            document.getElementById('devlog-section').style.display = (posts.length || document.body.classList.contains('edit-mode')) ? '' : 'none';
            posts.forEach(p => {
                const [head, ...body] = p.split('\n');
                const m = /^(\d{4}-\d{2}-\d{2})\s*\|\s*(.*)$/.exec(head.trim());
                const art = el('article', 'devlog-post');
                if (m) { const tm = el('time', '', m[1]); tm.dateTime = m[1]; art.appendChild(tm); }
                art.append(el('h3', '', m ? m[2] : head), el('p', '', body.join('\n').trim()));
                list.appendChild(art);
            });
        }

        function renderLinks() {
            const line = safeUrl(srcText('line-url').trim()), fab = document.getElementById('line-fab');
            fab.hidden = !line || line === 'https:///'; if (!fab.hidden) fab.href = line;
            const bl = document.getElementById('bcard-line'); if (bl) { bl.hidden = fab.hidden; if (!fab.hidden) document.getElementById('bcard-line-link').href = line; }
            const cv = safeUrl(srcText('resume-url').trim()), rb = document.getElementById('resume-btn');
            rb.hidden = !cv || cv === 'https:///'; if (!rb.hidden) rb.href = cv;
        }
        function renderHeroBusy() {
            const busy = srcText('hero-busy').trim() === '1';
            document.body.classList.toggle('hero-busy', busy);
            const cb = document.getElementById('hero-busy-toggle'); if (cb) cb.checked = busy;
        }
        function renderEditableLists() { renderPackages(); renderReviews(); renderReviewEditor(); renderDevlog(); renderLinks(); renderAdminEditors(); renderHeroBusy(); }

        // ================= 12a. ตัวแก้แบบเป็นช่องๆ สำหรับแอดมิน (เขียนกลับเป็นข้อความรูปแบบเดิม → ปุ่ม SAVE CONFIG ใช้ได้เหมือนเดิม) =================
        function writeSrc(id, text) {
            const src = document.getElementById(id); src.textContent = '';
            String(text).split('\n').forEach((line, i) => { if (i) src.appendChild(document.createElement('br')); src.appendChild(document.createTextNode(line)); });
        }
        const feClean = v => String(v ?? '').replace(/[|\r]+/g, '/').trim();
        // cfg: { box, items(), blank(), fields:[{key,type,label,ph,options,max,wide}], serialize(list), after() }
        function makeListEditor(cfg) {
            let state = null;
            const commit = () => { writeSrc(cfg.src, cfg.serialize(state)); if (cfg.after) cfg.after(); };
            function render() {
                const box = document.getElementById(cfg.box); if (!box) return;
                if (!document.body.classList.contains('edit-mode')) { box.replaceChildren(); state = null; return; }
                if (!state) state = cfg.items();
                box.replaceChildren();
                state.forEach((item, i) => {
                    const row = el('div', 'fe-row'); let line = el('div', 'fe-line'); row.appendChild(line);
                    cfg.fields.forEach(f => {
                        let input;
                        if (f.type === 'textarea') { input = el('textarea'); input.rows = f.rows || 3; input.value = item[f.key] || ''; }
                        else if (f.type === 'select') { input = el('select'); f.options.forEach(([v, l]) => input.appendChild(new Option(l, v))); input.value = item[f.key]; }
                        else if (f.type === 'check') { const lab = el('label', 'fe-check'); input = el('input'); input.type = 'checkbox'; input.checked = !!item[f.key]; lab.append(input, document.createTextNode(f.label)); line.appendChild(lab); }
                        else if (f.type === 'range') { input = el('input'); input.type = 'range'; input.min = 0; input.max = 100; input.step = 5; input.value = item[f.key]; }
                        else { input = el('input'); input.type = f.type || 'text'; input.value = item[f.key] || ''; }
                        if (f.ph) input.placeholder = f.ph;
                        if (f.max) input.maxLength = f.max;
                        if (f.title) input.title = f.title;
                        const update = () => { item[f.key] = f.type === 'check' ? input.checked : f.type === 'range' ? +input.value : input.value; if (val) val.textContent = input.value + '%'; commit(); };
                        input.addEventListener(f.type === 'check' || f.type === 'select' ? 'change' : 'input', update);
                        let val = null;
                        if (f.type !== 'check') {
                            if (f.wide) { line = el('div', 'fe-line'); row.appendChild(line); }
                            line.appendChild(input);
                            if (f.type === 'range') { val = el('span', 'fe-val', input.value + '%'); line.appendChild(val); }
                        }
                        if (f.hint) row.appendChild(el('div', 'fe-hint', f.hint));
                    });
                    const btns = el('span', 'fe-btns');
                    const mk = (txt, cls, title, fn) => { const b = el('button', cls, txt); b.type = 'button'; b.title = title; b.addEventListener('click', fn); btns.appendChild(b); };
                    mk('▲', '', 'เลื่อนขึ้น', () => { if (i > 0) { [state[i - 1], state[i]] = [state[i], state[i - 1]]; commit(); render(); } });
                    mk('▼', '', 'เลื่อนลง', () => { if (i < state.length - 1) { [state[i + 1], state[i]] = [state[i], state[i + 1]]; commit(); render(); } });
                    mk('X', 'del', 'ลบ', () => { if (confirm('ลบรายการนี้?')) { state.splice(i, 1); commit(); render(); } });
                    row.firstChild.appendChild(btns);
                    box.appendChild(row);
                });
            }
            const add = document.getElementById(cfg.add);
            if (add) add.addEventListener('click', () => { if (!state) state = cfg.items(); state.push(cfg.blank()); commit(); render(); const rows = document.getElementById(cfg.box).children; rows[rows.length - 1]?.querySelector('input:not([type=checkbox]), textarea')?.focus(); });
            return { render, reset: () => { state = null; render(); } };
        }

        const pkgEditor = makeListEditor({
            box: 'pkg-editor', add: 'pkg-add', src: 'pkg-src',
            items: () => srcLines('pkg-src').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).map(([n, price = '', det = '']) => ({ hot: /^★/.test(n), name: n.replace(/^★\s*/, ''), price, details: det.split(';').map(x => x.trim()).filter(Boolean).join('\n') })),
            blank: () => ({ hot: false, name: '', price: '', details: '' }),
            fields: [
                { key: 'name', ph: 'ชื่อแพ็กเกจ เช่น รับปริญญา', max: 60 },
                { key: 'price', ph: 'ราคา เช่น เริ่มต้น ฿2,500', max: 40 },
                { key: 'hot', type: 'check', label: '★ แนะนำ' },
                { key: 'details', type: 'textarea', wide: true, rows: 3, ph: 'รายละเอียด บรรทัดละ 1 ข้อ\nเช่น ถ่าย 2 ชั่วโมง\n150+ ภาพ', hint: 'รายละเอียด: กด Enter ขึ้นบรรทัดใหม่ = ข้อใหม่' },
            ],
            serialize: list => list.filter(p => p.name.trim()).map(p => `${p.hot ? '★ ' : ''}${feClean(p.name)} | ${feClean(p.price)} | ${String(p.details || '').split('\n').map(feClean).filter(Boolean).join('; ').replace(/;\s*;/g, ';')}`).join('\n'),
            after: () => { renderPackages(); },
        });
        const skillsEditor = makeListEditor({
            box: 'skills-editor', add: 'skills-add', src: 'skills-src',
            items: () => skillLines().map(l => { const m = /^(.*?)[\s:]+(\d{1,3})\s*%?$/.exec(l); return { name: m ? m[1].trim() : l, value: m ? Math.min(100, +m[2]) : 50 }; }),
            blank: () => ({ name: '', value: 50 }),
            fields: [ { key: 'name', ph: 'ชื่อทักษะ เช่น Python', max: 30 }, { key: 'value', type: 'range' } ],
            serialize: list => list.filter(x => x.name.trim()).map(x => `${feClean(x.name).replace(/\s+\d+$/, '')} ${x.value}`).join('\n'),
            after: () => renderSkills(false),
        });
        const devlogEditor = makeListEditor({
            box: 'devlog-editor', add: 'devlog-add', src: 'devlog-src',
            items: () => srcText('devlog-src').split(/\n\s*-{3,}\s*\n/).map(x => x.trim()).filter(Boolean).map(p => { const [head, ...body] = p.split('\n'); const m = /^(\d{4}-\d{2}-\d{2})\s*\|\s*(.*)$/.exec(head.trim()); return { date: m ? m[1] : '', title: m ? m[2] : head, body: body.join('\n').trim() }; }),
            blank: () => ({ date: new Date().toLocaleDateString('en-CA'), title: '', body: '' }),
            fields: [ { key: 'date', type: 'date', title: 'วันที่' }, { key: 'title', ph: 'หัวข้อโพสต์', max: 100 }, { key: 'body', type: 'textarea', wide: true, rows: 4, ph: 'เนื้อหา' } ],
            serialize: list => list.filter(p => p.title.trim() || p.body.trim()).map(p => `${p.date || new Date().toLocaleDateString('en-CA')} | ${feClean(p.title)}\n${String(p.body || '').replace(/^\s*-{3,}\s*$/gm, '— — —').trim()}`).join('\n---\n'),
            after: () => renderDevlog(),
        });
        // ช่องลิงก์: input ที่ผูกกับช่องข้อมูลเดิม
        function syncUrlInputs(fromSrc) {
            document.querySelectorAll('.fe-url').forEach(inp => {
                const id = inp.dataset.src, mark = document.querySelector(`.fe-url-ok[data-for="${id}"]`);
                if (fromSrc && document.activeElement !== inp) inp.value = srcText(id).trim();
                const v = inp.value.trim(), ok = !v || (safeUrl(v) && safeUrl(v) !== 'https:///');
                mark.className = 'fe-url-ok ' + (v ? (ok ? 'ok' : 'bad') : ''); mark.textContent = v ? (ok ? '✓ ลิงก์ใช้ได้' : '✕ ลิงก์ไม่ถูกต้อง') : '';
            });
        }
        function initUrlInputs() {
            document.querySelectorAll('.fe-url').forEach(inp => inp.addEventListener('input', () => { writeSrc(inp.dataset.src, inp.value.trim()); syncUrlInputs(false); renderLinks(); }));
        }
        function renderAdminEditors() { pkgEditor.render(); skillsEditor.render(); devlogEditor.render(); syncUrlInputs(true); }

        // ================= 12b. รีวิวจากลูกค้า: ฟอร์มส่ง + คิวรออนุมัติของแอดมิน =================
        let revFormStars = 0;
        function drawStarPicker(box, value, onPick) {
            box.replaceChildren();
            for (let n = 1; n <= 5; n++) {
                const b = el('button', n <= value ? 'on' : '', '★'); b.type = 'button'; b.title = `${n} ดาว`;
                b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(n === value)); b.setAttribute('aria-label', `${n} ดาว`);
                b.addEventListener('click', () => onPick(n));
                box.appendChild(b);
            }
        }
        // งานที่ถ่าย: แท็กจากชื่อแพ็กเกจ + "อื่นๆ" (พิมพ์เอง) · เลือกได้ 1 อย่าง
        let revJob = '', revJobOther = false;
        function revJobOptions() {
            const pk = srcLines('pkg-src').map(l => l.split('|')[0].replace(/^★\s*/, '').trim()).filter(Boolean);
            return [...new Set(pk)].slice(0, 10);
        }
        function renderRevJobTags() {
            const box = document.getElementById('rev-job-tags'); if (!box) return;
            const opts = revJobOptions();
            if (revJob && !revJobOther && !opts.includes(revJob)) revJobOther = true;
            box.replaceChildren();
            const make = (label, active, onClick) => { const b = el('button', active ? 'on' : '', label); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(active)); b.addEventListener('click', onClick); box.appendChild(b); };
            opts.forEach(o => make(o, !revJobOther && revJob === o, () => { revJobOther = false; revJob = revJob === o ? '' : o; syncRevJob(); }));
            make(t('rev_job_other'), revJobOther, () => { revJobOther = !revJobOther; if (!revJobOther) revJob = ''; syncRevJob(); if (revJobOther) document.getElementById('rev-job-other').focus(); });
            const other = document.getElementById('rev-job-other');
            other.hidden = !revJobOther; if (revJobOther && document.activeElement !== other) other.value = revJob;
        }
        function syncRevJob() {
            const other = document.getElementById('rev-job-other');
            if (revJobOther) revJob = other.value.trim();
            document.querySelector('#rev-form [name=job]').value = revJob;
            renderRevJobTags();
        }
        function openReviewForm(job) {
            const f = document.getElementById('rev-form');
            f.hidden = false; document.getElementById('rev-write-btn').hidden = true;
            if (job) { revJob = job; revJobOther = !revJobOptions().includes(job); syncRevJob(); }
            f.scrollIntoView({ block: 'center' });
            f.who.focus({ preventScroll: true });
        }
        function initReviewForm() {
            const f = document.getElementById('rev-form'), opened = Date.now();
            const pick = () => drawStarPicker(document.getElementById('rev-form-stars'), revFormStars, n => { revFormStars = n; pick(); });
            pick();
            document.getElementById('rev-job-other').addEventListener('input', (e) => { revJob = e.target.value.trim(); document.querySelector('#rev-form [name=job]').value = revJob; });
            syncRevJob();
            document.getElementById('rev-write-btn').addEventListener('click', () => openReviewForm());
            document.getElementById('client-review').addEventListener('click', () => {
                const job = document.getElementById('client-album-title').textContent;
                switchTab(null, 'home'); setTimeout(() => openReviewForm(job), 80);
            });
            f.addEventListener('submit', async (e) => {
                e.preventDefault();
                const st = document.getElementById('rev-status'), btn = document.getElementById('rev-submit');
                const fd = Object.fromEntries(new FormData(f).entries());
                if (!revFormStars || !fd.who.trim() || fd.text.trim().length < 5) { st.className = 'book-status err'; st.textContent = t('rev_required'); return; }
                btn.disabled = true; st.className = 'book-status'; st.textContent = t('f_sending');
                try {
                    const r = await fetch(`${SERVER_URL}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fd, stars: revFormStars, ts: opened }) });
                    const out = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(out.error || r.status);
                    st.className = 'book-status ok'; st.textContent = t('rev_ok'); f.reset(); revFormStars = 0; pick(); revJob = ''; revJobOther = false; document.getElementById('rev-job-other').value = ''; syncRevJob(); playLevelUpSound();
                } catch (err) { st.className = 'book-status err'; st.textContent = t('f_err') + (err.message ? ` (${err.message})` : ''); }
                finally { btn.disabled = false; }
            });
        }
        // แอดมิน: รีวิวรออนุมัติ — อนุมัติ = ย้ายเข้ารายการรีวิว (ลบออกจากคิวหลังกด SAVE CONFIG สำเร็จ)
        const approvedPending = new Set();
        let pendingLoadedFor = null;
        async function adminFetch(path, opts = {}) {
            const u = fbUser(); if (!u) throw new Error('not logged in');
            return fetch(SERVER_URL + path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${await u.getIdToken()}` } });
        }
        async function loadPendingReviews(force) {
            const box = document.getElementById('rev-pending'); if (!box) return;
            if (!document.body.classList.contains('edit-mode')) { box.replaceChildren(); pendingLoadedFor = null; return; }
            if (pendingLoadedFor && !force) return;
            pendingLoadedFor = Date.now();
            try {
                const r = await adminFetch('/reviews/pending'); if (!r.ok) throw new Error(r.status);
                const list = await r.json();
                box.replaceChildren();
                if (!list.length) return;
                box.appendChild(el('h4', '', `⏳ รีวิวรออนุมัติ (${list.length})`));
                list.forEach(p => {
                    const card = el('div', 'rev-pend');
                    card.append(el('div', '', `${'★'.repeat(p.stars)}${'☆'.repeat(5 - p.stars)}  ${p.who}${p.job ? ' · ' + p.job : ''}`), el('div', '', p.text));
                    const acts = el('div', 'acts');
                    const ok = el('button', 'ok', '✓ อนุมัติ'); ok.type = 'button';
                    const no = el('button', 'no', '✕ ลบ'); no.type = 'button';
                    ok.addEventListener('click', () => {
                        if (!revEditList) revEditList = revParse();
                        revEditList.push({ who: p.who, stars: p.stars, text: p.text, job: p.job || '' });
                        revWrite(revEditList); renderReviewEditor(); approvedPending.add(p.id);
                        acts.replaceChildren(el('span', '', '✓ อนุมัติแล้ว — กด SAVE CONFIG เพื่อบันทึก'));
                    });
                    no.addEventListener('click', async () => {
                        if (!confirm('ลบรีวิวนี้ทิ้ง?')) return;
                        try { const r = await adminFetch('/reviews/pending/' + encodeURIComponent(p.id), { method: 'DELETE' }); if (!r.ok) throw new Error(r.status); card.remove(); }
                        catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
                    });
                    acts.append(ok, no); card.appendChild(acts); box.appendChild(card);
                });
            } catch (e) { pendingLoadedFor = null; console.error('pending reviews', e); }
        }
        async function flushApprovedReviews() {
            for (const id of [...approvedPending]) {
                try { const r = await adminFetch('/reviews/pending/' + encodeURIComponent(id), { method: 'DELETE' }); if (r.ok) approvedPending.delete(id); } catch (e) {}
            }
            loadPendingReviews(true);
        }

        // ================= 12c. นามบัตร: พลิก / โชว์เต็มจอ / บันทึกรายชื่อ =================
        function initBusinessCard() {
            const wrap = document.getElementById('bcard-wrap'), card = document.getElementById('bcard'); if (!card) return;
            const flip = () => { const f = card.classList.toggle('flipped'); card.setAttribute('aria-pressed', String(f)); };
            card.addEventListener('click', (e) => {
                if (e.target.closest('a, .contact-link, [contenteditable="true"]')) return; // กดลิงก์/แก้ข้อความ = ไม่พลิก
                flip();
            });
            card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); flip(); } });
            document.getElementById('bcard-flip').addEventListener('click', flip);
            // เอียงตามเมาส์เล็กน้อย (เฉพาะจอที่มีเมาส์)
            if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                card.addEventListener('pointermove', (e) => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; card.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg'); card.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg'); });
                card.addEventListener('pointerleave', () => { card.style.setProperty('--ry', '0deg'); card.style.setProperty('--rx', '0deg'); });
            }
            const home = document.createComment('bcard'); wrap.before(home);
            const present = (on) => {
                // ย้ายไปไว้ใต้ body ตอนเต็มจอ ไม่ให้ติด stacking context ของหน้า
                if (on) document.body.appendChild(wrap); else home.after(wrap);
                wrap.classList.toggle('presenting', on);
                document.body.style.overflow = on ? 'hidden' : '';
                if (on) { card.classList.add('flipped'); card.setAttribute('aria-pressed', 'true'); card.focus({ preventScroll: true }); }
            };
            document.getElementById('bcard-present').addEventListener('click', () => present(true));
            document.getElementById('bcard-close').addEventListener('click', () => present(false));
            wrap.addEventListener('click', (e) => { if (e.target === wrap) present(false); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wrap.classList.contains('presenting')) present(false); });
            // บันทึกรายชื่อ (.vcf) จากข้อมูลบนบัตร
            document.getElementById('bcard-vcard').addEventListener('click', () => {
                const esc = v => String(v || '').replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, ' ').trim();
                const name = document.getElementById('card-name').innerText.trim() || 'PEEMCN25';
                const email = document.getElementById('contact-email').innerText.trim();
                const tel = document.getElementById('contact-tel').innerText.trim().replace(/[^\d+]/g, '');
                const line = document.getElementById('bcard-line').hidden ? '' : document.getElementById('bcard-line-link').href;
                const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(name)}`, 'ORG:PEEMCN25 · 101 STUDIO', `TITLE:${esc('Engineer / Photographer')}`,
                    email && `EMAIL;TYPE=INTERNET:${esc(email)}`, tel && `TEL;TYPE=CELL:${tel}`, 'URL:https://web.peemcn25.dev/',
                    'X-SOCIALPROFILE;TYPE=instagram:https://www.instagram.com/peem_pongpetch', 'X-SOCIALPROFILE;TYPE=facebook:https://www.facebook.com/peem.pongpetch',
                    line && `X-SOCIALPROFILE;TYPE=line:${line}`, 'END:VCARD'].filter(Boolean).join('\r\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([lines], { type: 'text/vcard;charset=utf-8' }));
                a.download = 'PEEMCN25.vcf'; document.body.appendChild(a); a.click();
                setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            });
        }

        // ================= 13. ฟอร์มจองคิว =================
        function initBooking() {
            const f = document.getElementById('book-form'); if (!f) return;
            const opened = Date.now();
            f.addEventListener('submit', async (e) => {
                e.preventDefault();
                const st = document.getElementById('book-status'), btn = document.getElementById('book-submit');
                const fd = Object.fromEntries(new FormData(f).entries());
                if (!fd.name.trim() || !fd.contact.trim()) { st.className = 'book-status err'; st.textContent = t('f_required'); return; }
                btn.disabled = true; st.className = 'book-status'; st.textContent = t('f_sending');
                try {
                    const r = await fetch(`${SERVER_URL}/inquiry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fd, pkg: fd.type, ts: opened }) });
                    const out = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(out.error || r.status);
                    st.className = 'book-status ok'; st.textContent = t('f_ok'); f.reset(); playLevelUpSound();
                } catch (err) { st.className = 'book-status err'; st.textContent = t('f_err') + (err.message ? ` (${err.message})` : ''); }
                finally { btn.disabled = false; }
            });
        }

        // ================= 14. แกลเลอรีลูกค้า =================
        let clientToken = null;
        try { clientToken = sessionStorage.getItem('peem_client'); } catch (e) {}
        const clientPhotoUrl = (id, w) => `${photoUrl(id, w)}&t=${encodeURIComponent(clientToken)}`;
        const clientDlUrl = (id) => `${SERVER_URL}/client/download/${encodeURIComponent(id)}?t=${encodeURIComponent(clientToken)}`;
        async function openClientAlbum() {
            const st = document.getElementById('client-status');
            try {
                const r = await fetch(`${SERVER_URL}/client/album?t=${encodeURIComponent(clientToken)}`);
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.error || r.status);
                document.getElementById('client-login').hidden = true;
                document.getElementById('client-album').hidden = false;
                document.getElementById('client-album-title').textContent = d.title;
                document.getElementById('client-album-meta').textContent = `${d.photos.length} PHOTOS`;
                const grid = document.getElementById('client-grid'); grid.replaceChildren();
                const photos = d.photos.map(p => ({ ...p, client: true }));
                if (!photos.length) grid.appendChild(el('p', 'agenda-empty', t('client_empty')));
                photos.forEach((p, i) => {
                    const wrap = el('div', 'ph');
                    const b = el('button'); b.type = 'button'; b.setAttribute('aria-label', `ภาพที่ ${i + 1}`);
                    const im = el('img'); im.loading = 'lazy'; im.alt = p.caption || ''; if (p.w && p.h) { im.width = p.w; im.height = p.h; }
                    im.src = clientPhotoUrl(p.id, 800); b.appendChild(im);
                    b.addEventListener('click', () => lbOpen(photos, i));
                    const dl = el('a', 'dl'); dl.innerHTML = svgIcon('download'); dl.href = clientDlUrl(p.id); dl.title = 'ดาวน์โหลดไฟล์ต้นฉบับ'; dl.setAttribute('aria-label', 'ดาวน์โหลดไฟล์ต้นฉบับ'); dl.setAttribute('download', '');
                    wrap.append(b, dl); grid.appendChild(wrap);
                });
            } catch (err) {
                clientToken = null; try { sessionStorage.removeItem('peem_client'); } catch (e) {}
                document.getElementById('client-login').hidden = false; document.getElementById('client-album').hidden = true;
                st.className = 'book-status err'; st.textContent = err.message || t('f_err');
            }
        }
        function initClient() {
            document.getElementById('client-login').addEventListener('submit', async (e) => {
                e.preventDefault();
                const st = document.getElementById('client-status'), code = document.getElementById('client-code').value.trim();
                if (!code) return;
                st.className = 'book-status'; st.textContent = t('f_sending');
                try {
                    const r = await fetch(`${SERVER_URL}/client/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
                    const d = await r.json().catch(() => ({}));
                    if (!r.ok || !d.token) throw new Error(d.error || r.status);
                    clientToken = d.token; try { sessionStorage.setItem('peem_client', d.token); } catch (e) {}
                    st.textContent = ''; document.getElementById('client-code').value = '';
                    playLevelUpSound(); openClientAlbum();
                } catch (err) { st.className = 'book-status err'; st.textContent = err.message || t('f_err'); }
            });
            document.getElementById('client-logout').addEventListener('click', () => {
                clientToken = null; try { sessionStorage.removeItem('peem_client'); } catch (e) {}
                document.getElementById('client-grid').replaceChildren();
                document.getElementById('client-album').hidden = true; document.getElementById('client-login').hidden = false;
            });
            if (clientToken) openClientAlbum();
        }

        // ================= 15. ภาษา TH / EN (เฉพาะข้อความของระบบ ส่วนที่แอดมินพิมพ์เองไม่แปล) =================
        const I18N = {
            th: { pkg_hot: 'แนะนำ', pkg_ask: 'สอบถามราคา', pkg_book: '▶ จองแพ็กเกจนี้', type_other: 'อื่นๆ / สอบถาม',
                  f_required: 'กรุณากรอกชื่อและช่องทางติดต่อ', f_sending: 'กำลังส่ง...', f_ok: '✓ ส่งแล้ว! เดี๋ยวติดต่อกลับเร็วๆ นี้นะครับ', f_err: 'ส่งไม่สำเร็จ',
                  client_empty: '> ยังไม่มีรูปในอัลบั้มนี้', cat_all: 'ทั้งหมด',
                  rev_required: 'กรุณาให้ดาว กรอกชื่อ และเขียนรีวิวอย่างน้อย 5 ตัวอักษร', rev_ok: '✓ ขอบคุณครับ! รีวิวจะขึ้นหลังจากตรวจสอบ', rev_job_other: '✎ อื่นๆ', today: '← วันนี้' },
            en: { nav_home: 'HOME', nav_projects: 'PROJECTS', nav_schedule: 'SCHEDULE', nav_files: 'FILES', nav_about: 'ABOUT', nav_contact: 'CONTACT',
                  book_title: '📅 Book a Shoot / Inquiry', book_note: 'Send your details and I will reply within 24 hours.',
                  f_name: 'Name *', f_contact: 'LINE ID / Phone / Email *', f_type: 'Type of work', f_date: 'Preferred date', f_msg: 'Details', f_msg_ph: 'Location, number of people, preferred style…', f_send: '▶ Send',
                  client_entry: '🔐 Clients: view your photos', client_title: 'CLIENT GALLERY', client_desc: 'Enter the album code you received to view and download your photos.', client_open: 'Unlock', client_logout: 'Leave album', client_tip: 'Tap a photo for fullscreen · ⬇ downloads the original file',
                  footer_client: 'CLIENT', line_chat: 'LINE',
                  pkg_hot: 'POPULAR', pkg_ask: 'Ask for price', pkg_book: '▶ Book this', type_other: 'Other / Ask',
                  f_required: 'Please enter your name and contact.', f_sending: 'Sending…', f_ok: '✓ Sent! I will get back to you soon.', f_err: 'Could not send',
                  client_empty: '> No photos in this album yet.', cat_all: 'ALL',
                  rev_empty: '> No reviews yet. Be the first!', rev_write: '✍ Write a review', rev_form_title: '⭐ Review my work', rev_form_note: 'Your review will appear after a quick check. Thank you!',
                  rev_f_name: 'Display name *', rev_f_job: 'Type of shoot (pick one)', rev_f_job_ph: 'Type it, e.g. Product shoot', rev_job_other: '✎ Other', today: '← today', cta_projects: '▶ See my work', cta_contact: '✉ Contact', lbl_email: 'EMAIL:', lbl_tel: 'TEL:', rev_f_text: 'Review *', rev_f_text_ph: 'What did you like? Anything to tell future clients?', rev_send: '▶ Send review',
                  rev_required: 'Please pick stars, enter your name and write at least 5 characters.', rev_ok: '✓ Thank you! Your review will appear after a quick check.', client_review: '⭐ Review this shoot' },
        };
        let lang = 'th';
        try { localStorage.removeItem('peem_lang'); } catch (e) {}
        function t(k) { return (I18N[lang] && I18N[lang][k]) || I18N.th[k] || k; }
        function applyLang() {
            document.documentElement.lang = lang;
            // ภาษาเดียว (ไทย): ไม่เขียนทับข้อความในหน้า — ถ้าเขียนทับ textContent ไอคอน SVG ในปุ่มจะหาย
            renderEditableLists(); renderPhotoCats(); if (typeof renderAgenda === 'function') renderAgenda();
        }

        // ================= 16. หมวดภาพในส่วนโชว์ภาพ =================
        let photoCat = '';
        let photoAll = [];
        function renderPhotoCats() {
            const box = document.getElementById('photo-cats'); if (!box) return;
            const cats = [...new Set(photoAll.map(p => p.cat).filter(Boolean))];
            box.style.display = cats.length ? '' : 'none';
            box.replaceChildren();
            ['', ...cats].forEach(c => {
                const b = el('button', 'proj-chip' + (c === photoCat ? ' on' : ''), c || t('cat_all')); b.type = 'button';
                b.addEventListener('click', () => { photoCat = c; photoState.list = c ? photoAll.filter(p => p.cat === c) : photoAll.slice(); rebuildPhotoThumbs(); renderPhotoCats(); photoShow(0, true); });
                box.appendChild(b);
            });
        }

        // 10. Matrix Background 
        let mCanvas, mCtx, mWidth, mHeight, columns, drops = []; 
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ</>{}[]~#'.split(''); const fontSize = 14;
        function initMatrix() { 
            mCanvas = document.getElementById('matrixCanvas'); 
            if(!mCanvas) return;
            mCtx = mCanvas.getContext('2d'); 
            const resizeMatrix = () => { mWidth = mCanvas.parentElement.clientWidth; mHeight = mCanvas.parentElement.clientHeight; mCanvas.width = mWidth; mCanvas.height = mHeight; columns = Math.floor(mWidth / fontSize); drops = []; for(let i = 0; i < columns; i++) drops[i] = Math.random() * -100; }; 
            window.addEventListener('resize', resizeMatrix); resizeMatrix(); 
            setInterval(drawMatrix, 50); 
        }
        function drawMatrix() { 
            if(!mCtx) return;
            // ไม่วาดตอนสลับไปแท็บอื่น หรือไม่ได้อยู่หน้า HOME (ประหยัดแบต/CPU บนมือถือ)
            if (document.hidden || !document.getElementById('home').classList.contains('active')) return;
            mCtx.fillStyle = 'rgba(244, 244, 244, 0.3)'; mCtx.fillRect(0, 0, mWidth, mHeight); 
            mCtx.fillStyle = '#a8a8a8'; mCtx.font = fontSize + 'px "VT323", monospace'; 
            for(let i = 0; i < drops.length; i++) { 
                const text = chars[Math.floor(Math.random() * chars.length)]; 
                mCtx.fillText(text, i * fontSize, drops[i] * fontSize); 
                if(drops[i] * fontSize > mHeight && Math.random() > 0.95) drops[i] = 0; drops[i]++; 
            } 
        }

        // 11. Firebase: โหลดเฉพาะตอนจำเป็น (ล็อกอิน / แอดมิน) — ผู้เข้าชมทั่วไปอ่านเนื้อหาผ่าน REST ไม่ต้องโหลด SDK
        const FIREBASE_CONFIG = { apiKey: "AIzaSyAME4-lEvIycQnsWHPbi7CaBlwNiu7_qFk", authDomain: "website101-1f97f.firebaseapp.com", projectId: "website101-1f97f", storageBucket: "website101-1f97f.firebasestorage.app", messagingSenderId: "1001758477689", appId: "1:1001758477689:web:80bc85fb1a2e8af90873a8", measurementId: "G-JB4XSPMCLS" };
        const FB_BASE = 'https://www.gstatic.com/firebasejs/10.8.0/';
        let fbPromise = null;
        function loadScript(src) { return new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => bad(new Error('โหลด ' + src + ' ไม่สำเร็จ')); document.head.appendChild(sc); }); }
        function fbUser() { return (window.firebase && firebase.apps && firebase.apps.length) ? firebase.auth().currentUser : null; }
        function loadFirebase() {
            if (fbPromise) return fbPromise;
            fbPromise = loadScript(FB_BASE + 'firebase-app-compat.js')
                .then(() => Promise.all([loadScript(FB_BASE + 'firebase-auth-compat.js'), loadScript(FB_BASE + 'firebase-firestore-compat.js')]))
                .then(() => {
                    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
            firebase.auth().onAuthStateChanged((user) => {
                try { user ? localStorage.setItem('peem_fb', '1') : localStorage.removeItem('peem_fb'); } catch (e) {}
                if (user) { 
                    // ถ้าล็อกอินสำเร็จ ซ่อนปุ่ม Login โชว์ปุ่ม Logout
                    document.getElementById('login-show-btn').style.display = 'none'; 
                    document.getElementById('logout-btn').style.display = 'block'; 
                    
                    // แต่ถ้าเป็น "แอดมิน" (peemdiamond@gmail.com) ถึงจะให้สิทธิ์แก้เว็บ และโชว์ปุ่มเพิ่มผู้ใช้
                    if (user.email === 'peemdiamond@gmail.com') {
                        document.body.classList.add('edit-mode'); 
                        document.getElementById('photo-section').style.display = '';
                        document.getElementById('save-btn').style.display = 'block'; 
                        document.getElementById('add-user-btn').style.display = 'block'; 
                        document.querySelectorAll('.edit-hint-proj, .edit-hint-cal, #add-project-btn').forEach(el => el.style.display = 'block');
                        document.querySelectorAll('.editable').forEach(el => el.setAttribute('contenteditable', 'true')); 
                    } else {
                        // นักศึกษา (ไม่ให้สิทธิ์แก้เว็บ)
                        document.body.classList.remove('edit-mode'); 
                        document.getElementById('save-btn').style.display = 'none'; 
                        document.getElementById('add-user-btn').style.display = 'none'; 
                        document.querySelectorAll('.edit-hint-proj, .edit-hint-cal, #add-project-btn').forEach(el => el.style.display = 'none');
                        document.querySelectorAll('.editable').forEach(el => el.setAttribute('contenteditable', 'false')); 
                    }
                    renderProjects(); renderAgenda(); renderEditableLists();
                    if (!document.body.classList.contains('edit-mode') && !photoState.list.length) document.getElementById('photo-section').style.display = 'none';

                } else { 
                    // ถ้าไม่ได้ล็อกอิน
                    document.body.classList.remove('edit-mode'); 
                    document.getElementById('login-show-btn').style.display = 'block'; 
                    document.getElementById('save-btn').style.display = 'none'; 
                    document.getElementById('add-user-btn').style.display = 'none'; 
                    document.getElementById('logout-btn').style.display = 'none'; 
                    document.querySelectorAll('.edit-hint-proj, .edit-hint-cal, #add-project-btn').forEach(el => el.style.display = 'none');
                    document.querySelectorAll('.editable').forEach(el => el.setAttribute('contenteditable', 'false')); 
                    renderProjects(); 

                    // เด้งออกจากหน้าโฟลเดอร์ลับ หากกด Logout
                    if(inSecretArea) {
                         inSecretArea = false; allFiles = []; currentFolderId = 'root';
                         closePreview();
                         document.getElementById('archive-ext-link').style.display = 'none';
                         document.getElementById('file-list').innerHTML = '<span style="color:var(--ibm-shadow); font-family: \'VT323\'; font-size:1.4rem; padding:10px;">> ACCESS DENIED.</span>';
                         folderHistory = [];
                         document.getElementById('archive-path').innerText = "C:\\ARCHIVE\\";
                         document.querySelectorAll('.folder-btn').forEach(b => b.classList.remove('active'));
                    }
                }
            });

                })
                .catch(err => { fbPromise = null; throw err; });
            return fbPromise;
        }
        function applyLoggedOutUI() {
            document.body.classList.remove('edit-mode');
            document.getElementById('login-show-btn').style.display = 'block';
            ['save-btn', 'add-user-btn', 'logout-btn'].forEach(id => document.getElementById(id).style.display = 'none');
            document.querySelectorAll('.edit-hint-proj, .edit-hint-cal, #add-project-btn').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.editable').forEach(el => el.setAttribute('contenteditable', 'false'));
        }
        // แปลงเอกสาร Firestore (REST) เป็น object ธรรมดา
        function fsValue(v) { if (!v) return undefined; if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue; if ('booleanValue' in v) return v.booleanValue; return undefined; }
        async function loadData() {
            try {
                const r = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/website/pixel_portfolio?key=${FIREBASE_CONFIG.apiKey}`);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const fields = (await r.json()).fields || {};
                const data = {}; Object.keys(fields).forEach(k => data[k] = fsValue(fields[k]));
                document.querySelectorAll('.editable').forEach(el => { const f = el.getAttribute('data-field'); if (f && typeof data[f] === 'string') el.innerHTML = sanitizeRich(data[f]); });
                if (data.schedule_list) { try { scheduleData = JSON.parse(data.schedule_list); } catch(e) { scheduleData = []; } }
                if (data.project_list) { try { projectData = JSON.parse(data.project_list); } catch(e) {} }
            } catch (error) { console.error("โหลดข้อมูลล้มเหลว:", error); }
            revEditList = null; pkgEditor.reset(); skillsEditor.reset(); devlogEditor.reset();
            renderCalendar(); renderProjects(); renderSkills(false); renderEditableLists();
        }

        document.addEventListener('DOMContentLoaded', () => {
            applyLoggedOutUI();
            loadData();
            // เคยล็อกอินค้างไว้ → โหลด Firebase เพื่อกู้สถานะล็อกอิน
            let had = false; try { had = localStorage.getItem('peem_fb') === '1'; } catch (e) {}
            if (had) loadFirebase().catch(console.error);

            const loginShowBtn = document.getElementById('login-show-btn');
            if (loginShowBtn) loginShowBtn.onclick = () => { document.getElementById('login-modal').style.display = 'flex'; loadFirebase().catch(err => alert(err.message)); };

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) logoutBtn.onclick = () => loadFirebase().then(() => firebase.auth().signOut());

            const saveBtn = document.getElementById('save-btn');
            if(saveBtn) {
                saveBtn.onclick = async () => {
                    const newData = {}; 
                    document.querySelectorAll('.editable[data-field]').forEach(el => { newData[el.getAttribute('data-field')] = sanitizeRich(el.innerHTML); });
                    newData['schedule_list'] = JSON.stringify(scheduleData);
                    newData['project_list'] = JSON.stringify(projectData);
                    
                    const syncData = new URLSearchParams(); syncData.append("action", "sync_data"); syncData.append("data", JSON.stringify(scheduleData));
                    fetch(GOOGLE_APP_SCRIPT_URL, { method: "POST", body: syncData, mode: 'no-cors' });

                    try {
                        const btn = document.getElementById('save-btn'); const originalText = btn.innerHTML;
                        btn.innerHTML = "SAVING..."; await loadFirebase(); await firebase.firestore().collection('website').doc('pixel_portfolio').set(newData, { merge: true }); 
                        btn.innerHTML = "SAVED!"; flushApprovedReviews(); setTimeout(() => btn.innerHTML = originalText, 2000);
                    } catch (error) { alert("SAVE FAILED: " + error.message); }
                };
            }

            const addUserBtn = document.getElementById('add-user-btn');
            if(addUserBtn) {
                addUserBtn.onclick = () => {
                    document.getElementById('new-user-email').value = '';
                    document.getElementById('new-user-password').value = '';
                    document.getElementById('create-user-modal').style.display = 'flex';
                }
            }

        });
    
