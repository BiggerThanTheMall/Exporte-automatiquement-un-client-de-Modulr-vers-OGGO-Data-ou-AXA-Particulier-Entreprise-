// ==UserScript==
// @name         Modulr → Export Client (OGGO & AXA)
// @namespace    https://github.com/BiggerThanTheMall/tampermonkey-ltoa
// @version      4.10.0
// @description  Exporte automatiquement un client de Modulr vers OGGO Data ou AXA (Particulier & Entreprise)
// @author       LTOA
// @match        https://courtage.modulr.fr/fr/scripts/clients/clients_card.php*
// @match        https://avenirprevoyanceetpatrimoine.oggo-data.net/admin/insurance/contacts/add*
// @match        https://inaxa.axa-courtage.fr/Pages/Accueil.aspx*
// @match        https://aiguilleur.axa-courtage.fr/iard/menu*
// @match        https://xnet.axa-courtage.fr/iard/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
//
// @updateURL    https://raw.githubusercontent.com/BiggerThanTheMall/tampermonkey-ltoa/main/Modulr-Export-Client-OGGO-AXA.user.js
// @downloadURL  https://raw.githubusercontent.com/BiggerThanTheMall/tampermonkey-ltoa/main/Modulr-Export-Client-OGGO-AXA.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // MAPPINGS
    // ============================================

    // Mapping des civilités Modulr → OGGO
    const civilityMapOggo = {
        '0': '',
        '1': '1', // M.
        '2': '2', // Mme
        '3': '2', // Mlle → Mme
        '4': '1', // M. et Mme → M.
        '5': '1', // M. et Mlle → M.
        '6': '1', // Dr → M.
        '7': '1'  // Me → M.
    };

    // Mapping des civilités Modulr → AXA
    const civilityMapAxa = {
        '0': ' ',
        '1': 'M',    // M.
        '2': 'MME',  // Mme
        '3': 'MLLE', // Mlle
        '4': 'M',    // M. et Mme → M.
        '5': 'M',    // M. et Mlle → M.
        '6': 'M',    // Dr → M.
        '7': 'M'     // Me → M.
    };

    // Mapping situation familiale texte → AXA
    const familyStatusMap = {
        'célibataire': 'CE',
        'celibataire': 'CE',
        'marié': 'MA',
        'marie': 'MA',
        'mariée': 'MA',
        'mariee': 'MA',
        'marié(e)': 'MA',
        'veuf': 'VE',
        'veuve': 'VE',
        'divorcé': 'DI',
        'divorce': 'DI',
        'divorcée': 'DI',
        'divorcee': 'DI',
        'concubin': 'CO',
        'concubine': 'CO',
        'concubinage': 'CO',
        'séparé': 'SE',
        'separe': 'SE',
        'séparée': 'SE',
        'separee': 'SE',
        'pacsé': 'PK',
        'pacse': 'PK',
        'pacsée': 'PK',
        'pacsee': 'PK'
    };

    // Mapping des formes juridiques Modulr → OGGO
    const legalFormMap = {
        '72': 'AE',
        '73': 'EI',
        '74': 'EURL',
        '75': 'SARL',
        '76': 'SA',
        '77': 'SAS',
        '78': 'SASU',
        '79': 'ASSOCIATION',
        '80': 'SCI',
        '81': 'SNC',
        '205': 'SCA'
    };

    // Mapping des formes juridiques texte → AXA value
    const legalFormMapAxa = {
        'sarl': 'SARL',
        'sas': 'SAS',
        'sasu': 'SASU',
        'sa': 'SA',
        'eurl': 'EURL',
        'ei': 'EI',
        'eirl': 'EIRL',
        'sci': 'SCI',
        'scp': 'SCP',
        'scm': 'SCM',
        'snc': 'SNC',
        'association': 'ASSOC',
        'selarl': 'SELAR',
        'selas': 'SELAS',
        'earl': 'EARL',
        'gaec': 'GAEC',
        'gie': 'GIE',
        'sc': 'SC',
        'cabinet': 'CAB'
    };

    // ============================================
    // FONCTIONS UTILITAIRES
    // ============================================

    // Parser la date de naissance (format "31/12/1940" ou "31/12/194084")
    function parseBirthDate(dateStr) {
        if (!dateStr) return { day: '', month: '', year: '' };

        // Nettoyer la chaîne - enlever tout ce qui n'est pas la date
        const cleanDate = dateStr.trim();

        // Regex pour extraire JJ/MM/AAAA (ignorer ce qui suit)
        const match = cleanDate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

        if (match) {
            return {
                day: match[1],
                month: match[2],
                year: match[3]
            };
        }

        return { day: '', month: '', year: '' };
    }

    // Parser la situation familiale
    function parseFamilyStatus(statusText) {
        if (!statusText) return 'CE'; // Célibataire par défaut

        const normalized = statusText.toLowerCase().trim();

        for (const [key, value] of Object.entries(familyStatusMap)) {
            if (normalized.includes(key)) {
                return value;
            }
        }

        return 'CE'; // Célibataire par défaut
    }

    // Parser la forme juridique vers AXA
    function parseLegalFormAxa(legalFormText) {
        if (!legalFormText) return '';
        const normalized = legalFormText.toLowerCase().trim();
        for (const [key, value] of Object.entries(legalFormMapAxa)) {
            if (normalized.includes(key)) {
                return value;
            }
        }
        return '';
    }

    // Nettoyer et formater un numéro de téléphone (garder uniquement les chiffres, max 10)
    function cleanPhoneNumber(phone) {
        if (!phone) return '';

        // Enlever tout ce qui n'est pas un chiffre
        let cleaned = phone.replace(/[^\d]/g, '');

        // Si le numéro commence par 33 (indicatif France), le convertir en 0
        if (cleaned.startsWith('33') && cleaned.length > 10) {
            cleaned = '0' + cleaned.substring(2);
        }

        // Garder uniquement les 10 premiers chiffres
        if (cleaned.length > 10) {
            cleaned = cleaned.substring(0, 10);
        }

        return cleaned;
    }

    // ============================================
    // PARTIE 1 : CODE POUR MODULR (clients_card.php)
    // ============================================
    if (window.location.hostname === 'courtage.modulr.fr' && window.location.pathname.includes('clients_card.php')) {

        console.log('[Export Client] Script v4.10 chargé sur Modulr');

        // *** FONCTION MODIFIÉE v4.10 : Détecter si c'est une entreprise ***
        // LOGIQUE : Si on trouve Prénom, Date de naissance, ou Civilité particulier → PARTICULIER
        // Même si rattaché à une entreprise !
        function isEnterprise() {
            const fields = document.querySelectorAll('.car_template_field');
            let hasRaisonSociale = false;
            let hasSiret = false;
            let hasParticulierField = false;

            for (const field of fields) {
                const label = field.querySelector('p.normal_fade');
                if (label) {
                    const labelText = label.textContent.trim();
                    const value = field.querySelector('p.medium_margin_bottom');
                    const valueText = value ? value.textContent.trim() : '';
                    const hasValue = valueText && !valueText.includes('Non renseigné');

                    // Champs ENTREPRISE
                    if (labelText === 'Raison sociale' && hasValue) {
                        hasRaisonSociale = true;
                        console.log('[Export Client] Détection: Raison sociale trouvée →', valueText);
                    }
                    if (labelText === 'SIREN/SIRET' && hasValue) {
                        hasSiret = true;
                        console.log('[Export Client] Détection: SIRET trouvé →', valueText);
                    }

                    // Champs PARTICULIER
                    if (labelText === 'Prénom' && hasValue) {
                        hasParticulierField = true;
                        console.log('[Export Client] Détection: Prénom trouvé →', valueText);
                    }
                    if (labelText === 'Date de naissance' && hasValue) {
                        hasParticulierField = true;
                        console.log('[Export Client] Détection: Date de naissance trouvée →', valueText);
                    }
                    if (labelText === 'Civilité' && hasValue) {
                        const civText = valueText.toLowerCase();
                        if (civText.includes('m.') || civText.includes('mme') || civText.includes('mlle') ||
                            civText.includes('monsieur') || civText.includes('madame') || civText.includes('mademoiselle') ||
                            civText.includes('dr') || civText.includes('me') || civText.includes('docteur') || civText.includes('maître')) {
                            hasParticulierField = true;
                            console.log('[Export Client] Détection: Civilité particulier trouvée →', valueText);
                        }
                    }
                }
            }

            // Vérifier aussi la civilité dans le titre de la page
            const pageTitle = document.querySelector('.client_name, h1, .page_title');
            if (pageTitle) {
                const titleText = pageTitle.textContent.trim();
                if (/^(M\.|Mme|Mlle|Dr|Me)\s/.test(titleText)) {
                    hasParticulierField = true;
                    console.log('[Export Client] Détection: Civilité particulier dans le titre →', titleText);
                }
            }

            // DÉCISION FINALE
            if (hasParticulierField) {
                console.log('[Export Client] ═══════════════════════════════════════');
                console.log('[Export Client] DÉCISION FINALE: PARTICULIER');
                console.log('[Export Client] (champs particulier détectés)');
                console.log('[Export Client] ═══════════════════════════════════════');
                return false;
            }

            if (hasRaisonSociale || hasSiret) {
                console.log('[Export Client] ═══════════════════════════════════════');
                console.log('[Export Client] DÉCISION FINALE: ENTREPRISE');
                console.log('[Export Client] (raison sociale/SIRET sans champs particulier)');
                console.log('[Export Client] ═══════════════════════════════════════');
                return true;
            }

            console.log('[Export Client] ═══════════════════════════════════════');
            console.log('[Export Client] DÉCISION FINALE: PARTICULIER (par défaut)');
            console.log('[Export Client] ═══════════════════════════════════════');
            return false;
        }

        // *** FONCTION : Récupérer les données entreprise depuis la page card ***
        function getEnterpriseDataFromPage() {
            const data = {
                clientType: 'enterprise',
                raisonSociale: '',
                siret: '',
                formeJuridique: '',
                adresse: '',
                codePostal: '',
                ville: '',
                telephone: ''
            };

            const fields = document.querySelectorAll('.car_template_field');
            fields.forEach(field => {
                const label = field.querySelector('p.normal_fade');
                const value = field.querySelector('p.medium_margin_bottom');

                if (label && value) {
                    const labelText = label.textContent.trim();
                    const valueText = value.textContent.trim();

                    if (labelText === 'Raison sociale' && valueText) {
                        data.raisonSociale = valueText;
                        console.log('[Export Client] Raison sociale:', valueText);
                    }

                    if (labelText === 'SIREN/SIRET' && valueText) {
                        data.siret = valueText.replace(/\s/g, '');
                        console.log('[Export Client] SIRET:', valueText, '→', data.siret);
                    }

                    if (labelText === 'Forme juridique' && valueText && !valueText.includes('Non renseigné')) {
                        data.formeJuridique = valueText;
                        console.log('[Export Client] Forme juridique:', valueText);
                    }
                }
            });

            const addressBlock = document.querySelector('.address_block_content');
            if (addressBlock) {
                const addressLines = addressBlock.innerHTML.split('<br>').map(line => {
                    const temp = document.createElement('div');
                    temp.innerHTML = line;
                    return temp.textContent.trim();
                }).filter(line => line);

                if (addressLines.length >= 1) {
                    data.adresse = addressLines[0];
                }
                if (addressLines.length >= 2) {
                    const cpVille = addressLines[1].match(/^(\d{5})\s+(.+)$/);
                    if (cpVille) {
                        data.codePostal = cpVille[1];
                        data.ville = cpVille[2];
                    }
                }
            }

            const phoneLink = document.querySelector('.vcard_bottom_line a[href^="tel:"]');
            if (phoneLink) {
                data.telephone = phoneLink.textContent.trim().replace(/\s/g, '');
            }

            console.log('[Export Client] Données entreprise complètes:', data);
            return data;
        }

        // Fonction pour récupérer les données depuis clients_manage.php
        function getModulrDataFromManagePage(clientId, callback) {
            console.log('[Export Client] Chargement des données depuis clients_manage.php...');

            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.top = '-9999px';
            iframe.style.left = '-9999px';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.src = `https://courtage.modulr.fr/fr/scripts/clients/clients_manage.php?client_id=${clientId}&mode=update`;

            document.body.appendChild(iframe);

            iframe.onload = function() {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;

                    const data = {
                        clientType: 'particular',
                        type: doc.querySelector('select[name="client[type]"]')?.value || '0',
                        title: doc.querySelector('select[name="client[title]"]')?.value || '0',
                        firstName: doc.querySelector('input[name="client[first_name]"]')?.value || '',
                        lastName: doc.querySelector('input[name="client[last_name]"]')?.value || '',
                        company: doc.querySelector('input[name="client[company]"]')?.value || '',
                        address1: doc.querySelector('input[name="client[address_1]"]')?.value || '',
                        address2: doc.querySelector('input[name="client[address_2]"]')?.value || '',
                        postalCode: doc.querySelector('input[name="client[postal_code]"]')?.value || '',
                        city: doc.querySelector('input[name="client[city]"]')?.value || '',
                        mobilePhone: doc.querySelector('input[name="client[mobile_phone]"]')?.value || '',
                        phone2: doc.querySelector('input[name="client[phone_2]"]')?.value || '',
                        email: doc.querySelector('input[name="client[email]"]')?.value || '',
                        businessName: doc.querySelector('input[name="client[business_name]"]')?.value || '',
                        legalForm: doc.querySelector('select[name="client[legal_form]"]')?.value || '',
                        registrationDate: doc.querySelector('input[name="client[registration_date]"]')?.value || '',
                        registrationNumber: doc.querySelector('input[name="client[registration_number]"]')?.value || '',
                        businessSector: doc.querySelector('input[name="client[business_sector]"]')?.value || '',
                        workforce: doc.querySelector('input[name="client[workforce]"]')?.value || '',
                        turnover: doc.querySelector('input[name="client[turnover]"]')?.value || '',
                        birthDate: doc.querySelector('input[name="client[birth_date]"]')?.value || ''
                    };

                    console.log('[Export Client] Données récupérées depuis manage:', data);

                    if (iframe.parentNode) {
                        document.body.removeChild(iframe);
                    }
                    callback(data);

                } catch (error) {
                    console.error('[Export Client] Erreur récupération données:', error);
                    alert('Erreur lors de la récupération des données du client');
                    if (iframe.parentNode) {
                        document.body.removeChild(iframe);
                    }
                }
            };

            iframe.onerror = function() {
                console.error('[Export Client] Erreur de chargement');
                alert('Impossible de charger les données du client');
                if (iframe.parentNode) {
                    document.body.removeChild(iframe);
                }
            };
        }

        // Fonction pour récupérer les données supplémentaires depuis la page card
        function getCardPageData() {
            const data = {
                familyStatus: '',
                birthDateDisplay: '',
                csp: ''
            };

            const allParagraphs = document.querySelectorAll('p.no_margin');
            allParagraphs.forEach(p => {
                const text = p.textContent.trim().toLowerCase();
                if (familyStatusMap[text] || text.includes('marié') || text.includes('célibataire') ||
                    text.includes('divorcé') || text.includes('veuf') || text.includes('pacsé') ||
                    text.includes('concubin') || text.includes('séparé')) {
                    data.familyStatus = p.textContent.trim();
                }
            });

            const fieldDivs = document.querySelectorAll('.car_template_field');
            fieldDivs.forEach(div => {
                const label = div.querySelector('p.no_margin.normal_fade');
                if (label && label.textContent.trim() === 'Date de naissance') {
                    const valueP = div.querySelector('p.no_margin.medium_margin_bottom');
                    if (valueP) {
                        const text = valueP.childNodes[0]?.textContent || valueP.textContent;
                        const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
                        if (dateMatch) {
                            data.birthDateDisplay = dateMatch[1];
                            console.log('[Export Client] Date de naissance trouvée:', data.birthDateDisplay);
                        }
                    }
                }
            });

            console.log('[Export Client] Données card page:', data);
            return data;
        }

        // Fonction d'export vers OGGO
        function exportToOggo() {
            const urlParams = new URLSearchParams(window.location.search);
            const clientId = urlParams.get('id');

            if (!clientId) {
                alert('Impossible de trouver l\'ID du client');
                return;
            }

            console.log('[Export Client] Démarrage export OGGO pour client ID:', clientId);

            getModulrDataFromManagePage(clientId, function(data) {
                GM_setValue('oggo_import_data', JSON.stringify(data));
                GM_setValue('oggo_import_timestamp', Date.now().toString());

                console.log('[Export Client] Données OGGO stockées');

                const newWindow = window.open('https://avenirprevoyanceetpatrimoine.oggo-data.net/admin/insurance/contacts/add', '_blank');

                if (!newWindow) {
                    alert('⚠️ Impossible d\'ouvrir OGGO.\nVeuillez autoriser les pop-ups pour ce site.');
                }
            });
        }

        // Fonction d'export vers AXA avec détection auto
        function exportToAxa() {
            const urlParams = new URLSearchParams(window.location.search);
            const clientId = urlParams.get('id');

            if (!clientId) {
                alert('Impossible de trouver l\'ID du client');
                return;
            }

            console.log('[Export Client] Démarrage export AXA pour client ID:', clientId);

            const isEnterpriseClient = isEnterprise();
            console.log('[Export Client] Type détecté:', isEnterpriseClient ? 'ENTREPRISE' : 'PARTICULIER');

            if (isEnterpriseClient) {
                const data = getEnterpriseDataFromPage();

                GM_setValue('axa_import_data', JSON.stringify(data));
                GM_setValue('axa_import_timestamp', Date.now().toString());
                GM_setValue('axa_import_step', 'start');

                console.log('[Export Client] Données AXA entreprise stockées');

                const newWindow = window.open('https://inaxa.axa-courtage.fr/Pages/Accueil.aspx', '_blank');

                if (!newWindow) {
                    alert('⚠️ Impossible d\'ouvrir AXA.\nVeuillez autoriser les pop-ups pour ce site.');
                }
            } else {
                const cardData = getCardPageData();

                getModulrDataFromManagePage(clientId, function(data) {
                    data.familyStatus = cardData.familyStatus;
                    data.birthDateDisplay = cardData.birthDateDisplay || data.birthDate;

                    GM_setValue('axa_import_data', JSON.stringify(data));
                    GM_setValue('axa_import_timestamp', Date.now().toString());
                    GM_setValue('axa_import_step', 'start');

                    console.log('[Export Client] Données AXA particulier stockées:', data);

                    const newWindow = window.open('https://inaxa.axa-courtage.fr/Pages/Accueil.aspx', '_blank');

                    if (!newWindow) {
                        alert('⚠️ Impossible d\'ouvrir AXA.\nVeuillez autoriser les pop-ups pour ce site.');
                    }
                });
            }
        }

        // Ajouter le bouton avec menu déroulant
        function addExportButton() {
            const urlParams = new URLSearchParams(window.location.search);
            if (!urlParams.has('id')) {
                console.log('[Export Client] Pas d\'ID client');
                return;
            }

            console.log('[Export Client] Ajout du bouton...');

            const clientNameElement = document.querySelector('.client_name, h1, .page_title');

            const container = document.createElement('div');
            container.id = 'export-btn-container';
            container.style.cssText = 'display: inline-block; position: relative; margin-left: 15px; vertical-align: middle;';

            const btn = document.createElement('a');
            btn.id = 'export-btn';
            btn.href = '#';
            btn.style.cssText = 'background: #688396; color: white; padding: 6px 12px; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; font-size: 14px; transition: background 0.3s ease; cursor: pointer;';
            btn.innerHTML = '<span class="fa fa-upload" style="margin-right: 6px; color: white;"></span>Exporter <span class="fa fa-caret-down" style="margin-left: 6px; color: white;"></span>';

            btn.onmouseover = () => btn.style.background = '#5e7687';
            btn.onmouseout = () => {
                if (!dropdown.classList.contains('open')) {
                    btn.style.background = '#688396';
                }
            };

            const dropdown = document.createElement('div');
            dropdown.id = 'export-dropdown';
            dropdown.style.cssText = 'position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.15); display: none; min-width: 120px; z-index: 10000; margin-top: 4px; overflow: hidden;';

            const oggoOption = document.createElement('a');
            oggoOption.href = '#';
            oggoOption.style.cssText = 'display: block; padding: 10px 15px; color: #333; text-decoration: none; font-size: 14px; transition: background 0.2s ease; border-bottom: 1px solid #eee;';
            oggoOption.innerHTML = 'OGGO Data';
            oggoOption.onmouseover = () => oggoOption.style.background = '#f5f5f5';
            oggoOption.onmouseout = () => oggoOption.style.background = 'white';
            oggoOption.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropdown.style.display = 'none';
                dropdown.classList.remove('open');
                btn.style.background = '#688396';
                launchExport('oggo');
            };

            const axaOption = document.createElement('a');
            axaOption.href = '#';
            axaOption.style.cssText = 'display: block; padding: 10px 15px; color: #333; text-decoration: none; font-size: 14px; transition: background 0.2s ease;';
            axaOption.innerHTML = 'AXA';
            axaOption.onmouseover = () => axaOption.style.background = '#f5f5f5';
            axaOption.onmouseout = () => axaOption.style.background = 'white';
            axaOption.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropdown.style.display = 'none';
                dropdown.classList.remove('open');
                btn.style.background = '#688396';
                launchExport('axa');
            };

            dropdown.appendChild(oggoOption);
            dropdown.appendChild(axaOption);

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (dropdown.style.display === 'none') {
                    dropdown.style.display = 'block';
                    dropdown.classList.add('open');
                    btn.style.background = '#5e7687';
                } else {
                    dropdown.style.display = 'none';
                    dropdown.classList.remove('open');
                    btn.style.background = '#688396';
                }
            };

            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    dropdown.style.display = 'none';
                    dropdown.classList.remove('open');
                    btn.style.background = '#688396';
                }
            });

            container.appendChild(btn);
            container.appendChild(dropdown);

            function launchExport(target) {
                const originalHTML = btn.innerHTML;

                btn.style.background = '#f0ad4e';
                btn.innerHTML = '<span class="fa fa-spinner fa-spin" style="margin-right: 6px; color: white;"></span>Export...';

                if (target === 'oggo') {
                    exportToOggo();
                } else if (target === 'axa') {
                    exportToAxa();
                }

                setTimeout(() => {
                    btn.style.background = '#5cb85c';
                    btn.innerHTML = '<span class="fa fa-check" style="margin-right: 6px; color: white;"></span>Lancé !';

                    setTimeout(() => {
                        btn.style.background = '#688396';
                        btn.innerHTML = originalHTML;
                    }, 3000);
                }, 1000);
            }

            if (clientNameElement) {
                clientNameElement.appendChild(container);
            } else {
                container.style.position = 'fixed';
                container.style.top = '120px';
                container.style.right = '20px';
                container.style.zIndex = '9999';
                document.body.appendChild(container);
            }

            console.log('[Export Client] Bouton ajouté');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addExportButton);
        } else {
            addExportButton();
        }
    }

    // ============================================
    // PARTIE 2 : CODE POUR OGGO (remplissage auto)
    // ============================================
    if (window.location.hostname === 'avenirprevoyanceetpatrimoine.oggo-data.net' &&
        window.location.pathname.includes('/admin/insurance/contacts/add')) {

        console.log('[Export Client] Script chargé sur OGGO');

        const importData = GM_getValue('oggo_import_data');
        const importTimestamp = GM_getValue('oggo_import_timestamp');

        if (!importData) {
            console.log('[Export Client] Pas de données OGGO à importer');
            return;
        }

        const now = Date.now();
        const timestamp = parseInt(importTimestamp);
        if (now - timestamp > 5 * 60 * 1000) {
            console.log('[Export Client] Données OGGO expirées');
            GM_deleteValue('oggo_import_data');
            GM_deleteValue('oggo_import_timestamp');
            return;
        }

        const data = JSON.parse(importData);
        console.log('[Export Client] Données OGGO trouvées, remplissage...', data);

        function fillOggoForm() {
            try {
                const isCompany = (data.type === '1' || data.type === '2');
                const clientTypeRadio = document.querySelector(`input[name="contact[wrapper][client_type]"][value="${isCompany ? 'corp' : 'default'}"]`);
                if (clientTypeRadio) {
                    clientTypeRadio.checked = true;
                    clientTypeRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    setTimeout(() => fillFields(), 1200);
                } else {
                    fillFields();
                }

                function fillFields() {
                    let notes = '';
                    const civilityValue = civilityMapOggo[data.title] || '';
                    const civilitySelect = document.querySelector('select[name="contact[wrapper][civility]"]');
                    if (civilitySelect && civilityValue) {
                        civilitySelect.value = civilityValue;
                        civilitySelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    if (data.title === '6') notes = '(Docteur)';
                    else if (data.title === '7') notes = '(Maître)';

                    const fields = {
                        'contact[wrapper][lastname]': data.lastName,
                        'contact[wrapper][firstname]': data.firstName,
                        'contact[wrapper][thoroughfare]': data.address1,
                        'contact[wrapper][premise]': data.address2,
                        'contact[wrapper][postal_code]': data.postalCode,
                        'contact[wrapper][city]': data.city,
                        'contact[wrapper][intl_phone]': data.mobilePhone,
                        'contact[wrapper][intl_phone2]': data.phone2,
                        'contact[wrapper][email]': data.email
                    };

                    for (const [name, value] of Object.entries(fields)) {
                        const field = document.querySelector(`input[name="${name}"]`);
                        if (field && value) {
                            field.value = value;
                            field.dispatchEvent(new Event('input', { bubbles: true }));
                            field.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }

                    if (isCompany) {
                        const companyFields = {
                            'contact[wrapper][corporate_name]': data.businessName,
                            'contact[wrapper][company_creation_date][date]': data.registrationDate,
                            'contact[wrapper][siret]': data.registrationNumber,
                            'contact[wrapper][ape]': data.businessSector,
                            'contact[wrapper][nb_employees]': data.workforce,
                            'contact[wrapper][turnover]': data.turnover
                        };

                        for (const [name, value] of Object.entries(companyFields)) {
                            const field = document.querySelector(`input[name="${name}"]`);
                            if (field && value) {
                                field.value = value;
                                field.dispatchEvent(new Event('input', { bubbles: true }));
                                field.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }

                        const legalFormSelect = document.querySelector('select[name="contact[wrapper][legal_form]"]');
                        if (legalFormSelect && data.legalForm) {
                            const oggoValue = legalFormMap[data.legalForm];
                            if (oggoValue) {
                                legalFormSelect.value = oggoValue;
                                legalFormSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }

                    if (notes) {
                        const textarea = document.querySelector('textarea[name="comment[comment][value]"]');
                        if (textarea) {
                            textarea.value = notes;
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }

                    console.log('[Export Client] Formulaire OGGO rempli !');

                    GM_deleteValue('oggo_import_data');
                    GM_deleteValue('oggo_import_timestamp');

                    setTimeout(() => {
                        const submitBtn = document.querySelector('button[type="submit"][id="edit-submit"]');
                        if (submitBtn) {
                            console.log('[Export Client] Soumission OGGO...');
                            submitBtn.click();
                        } else {
                            alert('⚠️ Formulaire rempli. Veuillez cliquer sur "Enregistrer".');
                        }
                    }, 2000);
                }

            } catch (error) {
                console.error('[Export Client] Erreur OGGO:', error);
                alert('Erreur lors du remplissage du formulaire OGGO');
            }
        }

        const checkForm = setInterval(() => {
            const form = document.querySelector('form');
            if (form) {
                clearInterval(checkForm);
                setTimeout(fillOggoForm, 1500);
            }
        }, 100);
    }

    // ============================================
    // PARTIE 3 : CODE POUR AXA - Page Accueil
    // ============================================
    if (window.location.hostname === 'inaxa.axa-courtage.fr' && window.location.pathname.includes('/Pages/Accueil.aspx')) {

        console.log('[Export Client] Script chargé sur AXA Accueil');

        const importData = GM_getValue('axa_import_data');
        const importStep = GM_getValue('axa_import_step');
        const importTimestamp = GM_getValue('axa_import_timestamp');

        if (!importData || importStep !== 'start') {
            console.log('[Export Client] Pas d\'import AXA en cours (visite manuelle)');
            return;
        }

        const now = Date.now();
        const timestamp = parseInt(importTimestamp);
        if (!timestamp || now - timestamp > 30 * 1000) {
            console.log('[Export Client] Données AXA expirées ou absentes (visite manuelle)');
            GM_deleteValue('axa_import_data');
            GM_deleteValue('axa_import_timestamp');
            GM_deleteValue('axa_import_step');
            return;
        }

        console.log('[Export Client] Import AXA détecté, clic sur lien aiguilleur...');

        GM_setValue('axa_import_step', 'xnet_clients');

        setTimeout(() => {
            const aiguilleurLink = document.querySelector('a.tool-linkUrl[href*="aiguilleur.axa-courtage.fr"]');
            if (aiguilleurLink) {
                console.log('[Export Client] Lien aiguilleur trouvé, clic...');
                aiguilleurLink.click();
            } else {
                console.error('[Export Client] Lien aiguilleur non trouvé');
                alert('⚠️ Impossible de trouver le lien vers l\'aiguilleur AXA. Veuillez y accéder manuellement.');
            }
        }, 1500);
    }

    // ============================================
    // PARTIE 4 : CODE POUR AXA - xnet (framer ignoré)
    // ============================================
    if (window.location.hostname === 'xnet.axa-courtage.fr' && window.location.pathname.includes('/iard/framer.jsp')) {
        console.log('[Export Client] Page framer.jsp ignorée');
    }

    // ============================================
    // PARTIE 5 : CODE POUR AXA - aiguilleur
    // ============================================
    if (window.location.hostname === 'aiguilleur.axa-courtage.fr') {
        console.log('[Export Client] Script chargé sur aiguilleur AXA');
    }

    // ============================================
    // PARTIE 6 : CODE POUR AXA - Toutes les pages xnet
    // ============================================
    if (window.location.hostname === 'xnet.axa-courtage.fr') {

        console.log('[Export Client] Script chargé sur xnet, pathname:', window.location.pathname);

        if (window.location.pathname.includes('/iard/framer.jsp')) {
            return;
        }

        const importData = GM_getValue('axa_import_data');
        const importStep = GM_getValue('axa_import_step');
        const importTimestamp = GM_getValue('axa_import_timestamp');

        if (!importData) {
            console.log('[Export Client] Pas de données AXA (visite manuelle)');
            return;
        }

        const now = Date.now();
        const timestamp = parseInt(importTimestamp);
        if (!timestamp || now - timestamp > 2 * 60 * 1000) {
            console.log('[Export Client] Données AXA expirées (visite manuelle)');
            GM_deleteValue('axa_import_data');
            GM_deleteValue('axa_import_timestamp');
            GM_deleteValue('axa_import_step');
            return;
        }

        const validSteps = ['xnet_clients', 'xnet_search', 'xnet_check_results', 'xnet_create', 'xnet_fill', 'xnet_fill_enterprise', 'retour_fiche', 'highlight_btn'];
        if (!validSteps.includes(importStep)) {
            console.log('[Export Client] Étape non valide:', importStep);
            return;
        }

        const data = JSON.parse(importData);
        console.log('[Export Client] xnet - Étape:', importStep, '- Type:', data.clientType || 'particular');

        function getDeptFromCP(cp) {
            if (!cp || cp.length < 2) return '';
            return cp.substring(0, 2);
        }

        function normalizeStr(str) {
            if (!str) return '';
            return str.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, ' ')
                .trim();
        }

        function showResultsPopup(matches, allResults, data, confidence, filterSteps) {
            const existingPopup = document.getElementById('ltoa-check-popup');
            if (existingPopup) existingPopup.remove();

            const isEnterprise = data.clientType === 'enterprise';
            const searchName = isEnterprise ? data.raisonSociale : `${data.lastName} ${data.firstName}`;

            const popup = document.createElement('div');
            popup.id = 'ltoa-check-popup';
            popup.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #ffffff; color: #333; padding: 20px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 999999; font-family: "Segoe UI", -apple-system, sans-serif; min-width: 320px; max-width: 400px; border: 1px solid #e0e0e0;';

            let html = '';

            if (matches.length === 0) {
                html = `
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <div style="width: 40px; height: 40px; background: #e8f5e9; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <span style="font-size: 20px;">✓</span>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 15px; color: #2e7d32;">Aucun doublon</div>
                            <div style="font-size: 12px; color: #666;">${searchName}</div>
                        </div>
                    </div>
                    <button id="ltoa-create-anyway" style="width: 100%; background: #1976d2; color: white; border: none; padding: 12px 16px; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">Créer le client</button>
                `;
            } else if (matches.length === 1 && confidence === 'high') {
                const m = matches[0];
                html = `
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <div style="width: 40px; height: 40px; background: #fff3e0; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <span style="font-size: 20px;">👤</span>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 15px; color: #e65100;">Client existant trouvé</div>
                            <div style="font-size: 12px; color: #666;">${searchName}</div>
                        </div>
                    </div>
                    <div style="background: #fafafa; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                        <div style="font-weight: 500; font-size: 13px; margin-bottom: 4px;">${m.nom}</div>
                        <div style="font-size: 12px; color: #666;">${m.adresse || 'Adresse non renseignée'}</div>
                        ${m.tel ? `<div style="font-size: 12px; color: #666;">📞 ${m.tel}</div>` : ''}
                    </div>
                    <details style="margin-bottom: 16px;">
                        <summary style="font-size: 12px; color: #888; cursor: pointer; user-select: none;">Voir les critères de correspondance</summary>
                        <div style="margin-top: 8px; padding: 10px; background: #f5f5f5; border-radius: 6px; font-size: 11px; color: #666;">
                            ${filterSteps ? filterSteps.map(s => `<div style="margin: 2px 0;">• ${s}</div>`).join('') : 'Correspondance sur le nom'}
                        </div>
                    </details>
                    <div style="display: flex; gap: 8px;">
                        <button id="ltoa-open-match" style="flex: 1; background: #1976d2; color: white; border: none; padding: 12px 16px; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">Ouvrir la fiche</button>
                        <button id="ltoa-create-anyway" style="flex: 1; background: #f5f5f5; color: #333; border: 1px solid #ddd; padding: 12px 16px; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">Créer quand même</button>
                    </div>
                `;
            } else {
                const matchWord = matches.length === 1 ? 'résultat similaire' : 'résultats similaires';
                html = `
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <div style="width: 40px; height: 40px; background: #e3f2fd; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <span style="font-size: 20px;">🔍</span>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 15px; color: #1565c0;">${matches.length} ${matchWord}</div>
                            <div style="font-size: 12px; color: #666;">${searchName}</div>
                        </div>
                    </div>
                    <details style="margin-bottom: 16px;">
                        <summary style="font-size: 13px; color: #555; cursor: pointer; user-select: none; font-weight: 500;">Voir les résultats trouvés</summary>
                        <div style="margin-top: 10px; max-height: 200px; overflow-y: auto;">
                            ${matches.map((m, idx) => `
                                <div style="background: #fafafa; border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: 500; font-size: 12px;">${m.nom}</div>
                                        <div style="font-size: 11px; color: #666;">${m.dept ? 'Dépt ' + m.dept : ''} ${m.adresse ? '• ' + m.adresse.substring(0, 25) + '...' : ''}</div>
                                    </div>
                                    <a href="#" class="ltoa-open-fiche" data-index="${idx}" style="color: #1976d2; text-decoration: none; font-size: 12px; font-weight: 500; padding: 6px 10px; background: #e3f2fd; border-radius: 6px;">Ouvrir</a>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                    <details style="margin-bottom: 16px;">
                        <summary style="font-size: 12px; color: #888; cursor: pointer; user-select: none;">Critères de recherche</summary>
                        <div style="margin-top: 8px; padding: 10px; background: #f5f5f5; border-radius: 6px; font-size: 11px; color: #666;">
                            ${filterSteps ? filterSteps.map(s => `<div style="margin: 2px 0;">• ${s}</div>`).join('') : ''}
                        </div>
                    </details>
                    <button id="ltoa-create-anyway" style="width: 100%; background: #1976d2; color: white; border: none; padding: 12px 16px; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">Créer le client</button>
                `;
            }

            html += `<button id="ltoa-cancel" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 18px; color: #999; cursor: pointer; padding: 4px 8px; line-height: 1;">×</button>`;

            popup.innerHTML = html;
            document.body.appendChild(popup);

            document.getElementById('ltoa-create-anyway')?.addEventListener('click', () => {
                popup.remove();
                GM_setValue('axa_import_step', 'xnet_create');
                if (typeof funcMenu === 'function') {
                    funcMenu(1);
                    return;
                }
                const clientMenuLink = document.querySelector('a[href*="funcMenu(1)"]');
                if (clientMenuLink) clientMenuLink.click();
            });

            document.getElementById('ltoa-cancel')?.addEventListener('click', () => {
                popup.remove();
                GM_deleteValue('axa_import_data');
                GM_deleteValue('axa_import_timestamp');
                GM_deleteValue('axa_import_step');
            });

            document.getElementById('ltoa-open-match')?.addEventListener('click', () => {
                if (matches[0]?.ficheLink) {
                    popup.remove();
                    GM_deleteValue('axa_import_data');
                    GM_deleteValue('axa_import_timestamp');
                    GM_deleteValue('axa_import_step');
                    matches[0].ficheLink.click();
                }
            });

            popup.querySelectorAll('.ltoa-open-fiche').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const idx = parseInt(link.dataset.index);
                    const match = matches[idx];
                    if (match?.ficheLink) {
                        popup.remove();
                        GM_deleteValue('axa_import_data');
                        GM_deleteValue('axa_import_timestamp');
                        GM_deleteValue('axa_import_step');
                        match.ficheLink.click();
                    }
                });
            });
        }

        function analyzeSearchResults(data) {
            const isEnterprise = data.clientType === 'enterprise';

            const modulrData = {
                nom: normalizeStr(isEnterprise ? data.raisonSociale : data.lastName),
                prenom: normalizeStr(isEnterprise ? '' : data.firstName),
                dept: getDeptFromCP(isEnterprise ? data.codePostal : data.postalCode),
                ville: normalizeStr(isEnterprise ? data.ville : data.city),
                adresse: normalizeStr(isEnterprise ? data.adresse : (data.address1 || '')),
                tel: (isEnterprise ? data.telephone : (data.mobilePhone || data.phone2 || '')).replace(/\D/g, '')
            };

            console.log('[Export Client] Données Modulr:', modulrData);

            const allResults = [];
            const rows = document.querySelectorAll('tr.coulLig1, tr.coulLig2');

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) {
                    const ficheLink = row.querySelector('a[href*="funcChainageTrans"]');
                    const nomComplet = cells[2]?.textContent?.trim() || '';
                    const adresseAxa = cells[5]?.textContent?.trim() || '';
                    const dept = cells[6]?.textContent?.trim() || '';
                    const tel = (cells[7]?.textContent?.trim() || '').replace(/\D/g, '');

                    if (nomComplet) {
                        const adresseParts = adresseAxa.split(',');
                        const villeAxa = adresseParts.length > 1 ? normalizeStr(adresseParts[adresseParts.length - 1]) : '';
                        const rueAxa = normalizeStr(adresseParts[0] || '');

                        allResults.push({
                            nom: nomComplet,
                            nomNorm: normalizeStr(nomComplet),
                            adresse: adresseAxa,
                            rueNorm: rueAxa,
                            villeNorm: villeAxa,
                            dept,
                            tel,
                            ficheLink
                        });
                    }
                }
            });

            console.log('[Export Client] Total résultats AXA:', allResults.length);

            if (allResults.length === 0) {
                return { results: [], matches: [], confidence: 'none', filterSteps: ['Aucun résultat trouvé'] };
            }

            let candidates = [...allResults];
            const filterSteps = [];

            // ÉTAPE 1 : Filtrer par NOM
            candidates = candidates.filter(r => r.nomNorm.includes(modulrData.nom) || modulrData.nom.includes(r.nomNorm));
            filterSteps.push(`Nom "${modulrData.nom}" → ${candidates.length} résultat(s)`);

            if (candidates.length === 0) {
                return { results: allResults, matches: [], confidence: 'none', filterSteps };
            }
            if (candidates.length === 1) {
                const match = candidates[0];
                if (modulrData.dept && match.dept === modulrData.dept) {
                    filterSteps.push(`✅ Confirmé par département ${modulrData.dept}`);
                    return { results: allResults, matches: candidates, confidence: 'high', filterSteps };
                } else {
                    filterSteps.push(`⚠️ Seul résultat mais dept différent (${match.dept} vs ${modulrData.dept})`);
                    return { results: allResults, matches: candidates, confidence: 'medium', filterSteps };
                }
            }

            // ÉTAPE 2 : Filtrer par PRÉNOM
            if (!isEnterprise && modulrData.prenom) {
                const withPrenom = candidates.filter(r => r.nomNorm.includes(modulrData.prenom));
                if (withPrenom.length > 0 && withPrenom.length < candidates.length) {
                    candidates = withPrenom;
                    filterSteps.push(`Prénom "${modulrData.prenom}" → ${candidates.length} résultat(s)`);
                    if (candidates.length === 1) {
                        return { results: allResults, matches: candidates, confidence: 'high', filterSteps };
                    }
                }
            }

            // ÉTAPE 3 : Filtrer par DÉPARTEMENT
            if (modulrData.dept) {
                const withDept = candidates.filter(r => r.dept === modulrData.dept);
                if (withDept.length > 0 && withDept.length < candidates.length) {
                    candidates = withDept;
                    filterSteps.push(`Département ${modulrData.dept} → ${candidates.length} résultat(s)`);
                    if (candidates.length === 1) {
                        return { results: allResults, matches: candidates, confidence: 'high', filterSteps };
                    }
                }
            }

            // ÉTAPE 4 : Filtrer par VILLE
            if (modulrData.ville && modulrData.ville.length >= 3) {
                const villeShort = modulrData.ville.substring(0, 4);
                const withVille = candidates.filter(r => r.villeNorm.includes(villeShort) || modulrData.ville.includes(r.villeNorm.substring(0, 4)));
                if (withVille.length > 0 && withVille.length < candidates.length) {
                    candidates = withVille;
                    filterSteps.push(`Ville "${modulrData.ville}" → ${candidates.length} résultat(s)`);
                    if (candidates.length === 1) {
                        return { results: allResults, matches: candidates, confidence: 'high', filterSteps };
                    }
                }
            }

            // ÉTAPE 5 : Filtrer par ADRESSE
            if (modulrData.adresse && modulrData.adresse.length >= 5) {
                const motsAdresse = modulrData.adresse.split(' ').filter(m => m.length > 2);
                const withAdresse = candidates.filter(r => motsAdresse.some(mot => r.rueNorm.includes(mot)));
                if (withAdresse.length > 0 && withAdresse.length < candidates.length) {
                    candidates = withAdresse;
                    filterSteps.push(`Adresse → ${candidates.length} résultat(s)`);
                    if (candidates.length === 1) {
                        return { results: allResults, matches: candidates, confidence: 'high', filterSteps };
                    }
                }
            }

            // ÉTAPE 6 : Filtrer par TÉLÉPHONE
            if (modulrData.tel && modulrData.tel.length >= 8) {
                const telShort = modulrData.tel.slice(-8);
                const withTel = candidates.filter(r => r.tel && r.tel.length >= 8 && r.tel.includes(telShort));
                if (withTel.length > 0 && withTel.length < candidates.length) {
                    candidates = withTel;
                    filterSteps.push(`Téléphone → ${candidates.length} résultat(s)`);
                    if (candidates.length === 1) {
                        return { results: allResults, matches: candidates, confidence: 'high', filterSteps };
                    }
                }
            }

            if (candidates.length === 1) {
                return { results: allResults, matches: candidates, confidence: 'high', filterSteps };
            } else if (candidates.length <= 3) {
                filterSteps.push(`⚠️ ${candidates.length} candidats restants après tous les filtres`);
                return { results: allResults, matches: candidates, confidence: 'medium', filterSteps };
            } else {
                filterSteps.push(`⚠️ Trop de résultats (${candidates.length}) - vérification manuelle requise`);
                return { results: allResults, matches: candidates, confidence: 'low', filterSteps };
            }
        }

        function waitForFuncMenuAndExecute() {
            if (typeof funcMenu === 'function') {
                executeStep();
            } else {
                const clientsLink = document.querySelector('a[href*="funcMenu(1)"]');
                if (clientsLink) {
                    executeStep();
                } else {
                    setTimeout(waitForFuncMenuAndExecute, 300);
                }
            }
        }

        function executeStep() {
            // Étape 1 : Cliquer sur "Clients"
            if (importStep === 'xnet_clients') {
                console.log('[Export Client] Étape xnet_clients: clic sur Clients...');
                setTimeout(() => {
                    if (typeof funcMenu === 'function') {
                        GM_setValue('axa_import_step', 'xnet_search');
                        funcMenu(1);
                    } else {
                        const clientsLink = document.querySelector('a[href*="funcMenu(1)"]');
                        if (clientsLink) {
                            GM_setValue('axa_import_step', 'xnet_search');
                            clientsLink.click();
                        }
                    }
                }, 500);
            }

            // Étape 2 : Rechercher le client par nom
            if (importStep === 'xnet_search') {
                console.log('[Export Client] Étape xnet_search: recherche client...');
                setTimeout(() => {
                    const searchInput = document.querySelector('input[name="clientRechNom"]');
                    const okButton = document.querySelector('input.btnOK[value="Ok"]');

                    if (searchInput && okButton) {
                        const isEnterprise = data.clientType === 'enterprise';
                        let searchName = isEnterprise ? data.raisonSociale : data.lastName;

                        if (isEnterprise && searchName) {
                            searchName = searchName.replace(/[^A-Za-z0-9\s]/g, '').trim();
                            console.log('[Export Client] Nom entreprise nettoyé pour recherche:', searchName);
                        }

                        if (searchName) {
                            searchInput.value = searchName;
                            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                            console.log('[Export Client] Recherche:', searchName);
                            GM_setValue('axa_import_step', 'xnet_check_results');
                            setTimeout(() => okButton.click(), 300);
                        } else {
                            console.log('[Export Client] Pas de nom à rechercher, création directe');
                            GM_setValue('axa_import_step', 'xnet_create');
                        }
                    } else {
                        console.log('[Export Client] Champ recherche non trouvé, retry...');
                        setTimeout(() => executeStep(), 500);
                    }
                }, 800);
            }

            // Étape 3 : Analyser les résultats de recherche
            if (importStep === 'xnet_check_results') {
                console.log('[Export Client] Étape xnet_check_results: analyse résultats...');
                setTimeout(() => {
                    const resultRows = document.querySelectorAll('tr.coulLig1, tr.coulLig2');
                    if (resultRows.length > 0) {
                        console.log('[Export Client] ' + resultRows.length + ' résultat(s) trouvé(s)');
                        const { results, matches, confidence, filterSteps } = analyzeSearchResults(data);
                        showResultsPopup(matches, results, data, confidence, filterSteps);
                    } else {
                        console.log('[Export Client] ✅ 0 résultat → création possible');
                        showResultsPopup([], [], data, 'none', ['Aucun client trouvé dans AXA']);
                    }
                }, 1500);
            }

            // Étape 4 : Cliquer sur création fiche (P ou E selon le type)
            if (importStep === 'xnet_create') {
                console.log('[Export Client] Étape xnet_create...');
                setTimeout(() => {
                    if (typeof funcNewcli === 'function') {
                        if (data.clientType === 'enterprise') {
                            GM_setValue('axa_import_step', 'xnet_fill_enterprise');
                            funcNewcli('E');
                            console.log('[Export Client] funcNewcli(E) - ENTREPRISE');
                        } else {
                            GM_setValue('axa_import_step', 'xnet_fill');
                            funcNewcli('P');
                            console.log('[Export Client] funcNewcli(P) - PARTICULIER');
                        }
                        return;
                    }

                    const isEnterprise = data.clientType === 'enterprise';
                    const allLinks = document.querySelectorAll('a[href*="funcNewcli"]');
                    let createLink = null;

                    allLinks.forEach(link => {
                        const href = link.getAttribute('href') || '';
                        if (isEnterprise && href.includes("'E'")) {
                            createLink = link;
                        } else if (!isEnterprise && href.includes("'P'")) {
                            createLink = link;
                        }
                    });

                    if (createLink) {
                        console.log('[Export Client] Lien création trouvé, clic...');
                        if (isEnterprise) {
                            GM_setValue('axa_import_step', 'xnet_fill_enterprise');
                        } else {
                            GM_setValue('axa_import_step', 'xnet_fill');
                        }
                        createLink.click();
                        return;
                    }

                    const clientMenuLink = document.querySelector('a[href*="funcMenu(1)"]');
                    if (clientMenuLink) {
                        console.log('[Export Client] Retour au menu Client...');
                        clientMenuLink.click();
                        setTimeout(() => executeStep(), 1000);
                        return;
                    }

                    console.log('[Export Client] Impossible de trouver le lien de création, retry...');
                    setTimeout(() => executeStep(), 500);
                }, 500);
            }

            // Étape 5a : Remplir formulaire PARTICULIER
            if (importStep === 'xnet_fill') {
                console.log('[Export Client] Remplissage formulaire PARTICULIER...');
                setTimeout(() => fillAxaFormParticular(data), 800);
            }

            // Étape 5b : Remplir formulaire ENTREPRISE
            if (importStep === 'xnet_fill_enterprise') {
                console.log('[Export Client] Remplissage formulaire ENTREPRISE...');
                setTimeout(() => fillAxaFormEnterprise(data), 800);
            }

            // Étape 6 : Retour fiche
            if (importStep === 'retour_fiche') {
                setTimeout(() => {
                    const retourBtn = document.querySelector('input[value="Retour fiche"]');
                    if (retourBtn) {
                        GM_setValue('axa_import_step', 'highlight_btn');
                        retourBtn.click();
                    }
                }, 800);
            }

            // Étape 7 : Highlight
            if (importStep === 'highlight_btn') {
                setTimeout(() => {
                    GM_deleteValue('axa_import_data');
                    GM_deleteValue('axa_import_timestamp');
                    GM_deleteValue('axa_import_step');
                    highlightRetourFiche();
                }, 1000);
            }
        }

        // Fonction remplissage PARTICULIER
        function fillAxaFormParticular(data) {
            const qualSelect = document.querySelector('select[name="qual"]');
            const nomInput = document.querySelector('input[name="nom"]');

            if (!qualSelect && !nomInput) {
                setTimeout(() => fillAxaFormParticular(data), 1000);
                return;
            }

            try {
                if (qualSelect) {
                    qualSelect.value = civilityMapAxa[data.title] || ' ';
                    qualSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }

                if (nomInput) {
                    nomInput.value = `${data.lastName.toUpperCase()}, ${data.firstName}`;
                    nomInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const adr1Input = document.querySelector('input[name="adr1"]');
                const adr2Input = document.querySelector('input[name="adr2"]');
                const fullAddress = `${data.address1 || ''} ${data.address2 || ''}`.trim();

                if (adr1Input) {
                    if (fullAddress.length <= 36) {
                        adr1Input.value = fullAddress;
                    } else {
                        let cutPoint = fullAddress.lastIndexOf(' ', 36);
                        if (cutPoint === -1) cutPoint = 36;
                        adr1Input.value = fullAddress.substring(0, cutPoint);
                        if (adr2Input) {
                            adr2Input.value = fullAddress.substring(cutPoint).trim();
                        }
                    }
                    adr1Input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const cpInput = document.querySelector('input[name="codePostal"]');
                if (cpInput && data.postalCode) {
                    cpInput.value = data.postalCode;
                    cpInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const villeInput = document.querySelector('input[name="ville"]');
                if (villeInput && data.city) {
                    villeInput.value = data.city.toUpperCase();
                    villeInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const paysInput = document.querySelector('input[name="pays"]');
                if (paysInput) {
                    paysInput.value = 'FR';
                    paysInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const telInput = document.querySelector('input[name="tel1"]');
                if (telInput) {
                    telInput.value = cleanPhoneNumber(data.mobilePhone || data.phone2 || '');
                    telInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const birthDate = parseBirthDate(data.birthDateDisplay || data.birthDate);
                const naisJJInput = document.querySelector('input[name="naisJJ"]');
                const naisMMInput = document.querySelector('input[name="naisMM"]');
                const naisAAAAInput = document.querySelector('input[name="naisAAAA"]');

                if (naisJJInput && birthDate.day) naisJJInput.value = birthDate.day;
                if (naisMMInput && birthDate.month) naisMMInput.value = birthDate.month;
                if (naisAAAAInput && birthDate.year) naisAAAAInput.value = birthDate.year;

                const cspSelect = document.querySelector('select[name="csp1"]');
                if (cspSelect) cspSelect.value = '90';

                console.log('[Export Client] Formulaire PARTICULIER rempli !');

                setTimeout(() => {
                    const complementsTab = document.querySelector('a#i2') || document.querySelector('a[href*="onglet(\'2\')"]');

                    if (complementsTab) {
                        complementsTab.click();

                        setTimeout(() => {
                            const sitFamSelect = document.querySelector('select[name="sitFam"]');
                            if (sitFamSelect) {
                                sitFamSelect.value = parseFamilyStatus(data.familyStatus);
                            }

                            setTimeout(() => {
                                const updateBtn = document.querySelector('input[value="Mettre à jour"]');
                                if (updateBtn) {
                                    GM_setValue('axa_import_step', 'retour_fiche');
                                    updateBtn.click();
                                } else {
                                    GM_deleteValue('axa_import_data');
                                    GM_deleteValue('axa_import_timestamp');
                                    GM_deleteValue('axa_import_step');
                                    alert('✅ Formulaire rempli ! Cliquez sur "Mettre à jour".');
                                }
                            }, 600);
                        }, 600);
                    }
                }, 800);

            } catch (error) {
                console.error('[Export Client] Erreur PARTICULIER:', error);
                GM_deleteValue('axa_import_data');
                GM_deleteValue('axa_import_timestamp');
                GM_deleteValue('axa_import_step');
            }
        }

        // Fonction remplissage ENTREPRISE
        function fillAxaFormEnterprise(data) {
            const qualSelect = document.querySelector('select[name="qual"]');
            const nomInput = document.querySelector('input[name="nom"]');

            if (!qualSelect && !nomInput) {
                setTimeout(() => fillAxaFormEnterprise(data), 1000);
                return;
            }

            console.log('[Export Client] Formulaire ENTREPRISE trouvé, remplissage...');
            console.log('[Export Client] Données reçues:', data);

            try {
                if (qualSelect && data.formeJuridique) {
                    const legalFormValue = parseLegalFormAxa(data.formeJuridique);
                    if (legalFormValue) {
                        qualSelect.value = legalFormValue;
                        qualSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log('[Export Client] Forme juridique:', data.formeJuridique, '→', legalFormValue);
                    }
                }

                if (nomInput && data.raisonSociale) {
                    const cleanName = data.raisonSociale.replace(/[^A-Za-z0-9]/g, '');
                    nomInput.value = cleanName;
                    nomInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('[Export Client] Nom:', data.raisonSociale, '→', cleanName);
                }

                const adr1Input = document.querySelector('input[name="adr1"]');
                if (adr1Input && data.adresse) {
                    adr1Input.value = data.adresse.substring(0, 36);
                    adr1Input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const cpInput = document.querySelector('input[name="codePostal"]');
                if (cpInput && data.codePostal) {
                    cpInput.value = data.codePostal;
                    cpInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const villeInput = document.querySelector('input[name="ville"]');
                if (villeInput && data.ville) {
                    villeInput.value = data.ville.toUpperCase();
                    villeInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const paysInput = document.querySelector('input[name="pays"]');
                if (paysInput) {
                    paysInput.value = 'FR';
                    paysInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                if (data.siret && data.siret.length >= 14) {
                    const s = data.siret.replace(/\s/g, '');
                    const siret1 = document.querySelector('input[name="siret1"]');
                    const siret2 = document.querySelector('input[name="siret2"]');
                    const siret3 = document.querySelector('input[name="siret3"]');
                    const siret4 = document.querySelector('input[name="siret4"]');

                    if (siret1) siret1.value = s.substring(0, 3);
                    if (siret2) siret2.value = s.substring(3, 6);
                    if (siret3) siret3.value = s.substring(6, 9);
                    if (siret4) siret4.value = s.substring(9, 14);

                    console.log('[Export Client] SIRET:', s);
                }

                const telInput = document.querySelector('input[name="tel1"]');
                if (telInput && data.telephone) {
                    telInput.value = cleanPhoneNumber(data.telephone);
                    telInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                console.log('[Export Client] Formulaire ENTREPRISE rempli !');

                setTimeout(() => {
                    const contactsTab = document.querySelector('a#i2') || document.querySelector('a[href*="onglet(\'2\')"]');

                    if (contactsTab) {
                        contactsTab.click();

                        setTimeout(() => {
                            const updateBtn = document.querySelector('input[value="Mettre à jour"]');
                            if (updateBtn) {
                                GM_setValue('axa_import_step', 'retour_fiche');
                                updateBtn.click();
                            } else {
                                GM_deleteValue('axa_import_data');
                                GM_deleteValue('axa_import_timestamp');
                                GM_deleteValue('axa_import_step');
                                alert('✅ Formulaire ENTREPRISE rempli ! Cliquez sur "Mettre à jour".');
                            }
                        }, 600);
                    } else {
                        GM_deleteValue('axa_import_data');
                        GM_deleteValue('axa_import_timestamp');
                        GM_deleteValue('axa_import_step');
                        alert('✅ Formulaire ENTREPRISE rempli ! Cliquez sur "Mettre à jour".');
                    }
                }, 800);

            } catch (error) {
                console.error('[Export Client] Erreur ENTREPRISE:', error);
                GM_deleteValue('axa_import_data');
                GM_deleteValue('axa_import_timestamp');
                GM_deleteValue('axa_import_step');
            }
        }

        // Fonction highlight bouton Devis/AN
        function highlightRetourFiche() {
            let targetBtn = document.querySelector('input[value="Devis/AN"]');
            if (!targetBtn) {
                targetBtn = document.querySelector('input[onclick*="funcChainageProduction"]');
            }

            if (!targetBtn) {
                console.log('[Export Client] Bouton Devis/AN non trouvé');
                return;
            }

            const wrapper = document.createElement('span');
            wrapper.style.cssText = 'position: relative; display: inline-block;';

            targetBtn.parentNode.insertBefore(wrapper, targetBtn);
            wrapper.appendChild(targetBtn);

            const originalStyle = targetBtn.getAttribute('style') || '';
            targetBtn.style.cssText = `
                background: linear-gradient(135deg, #00008f 0%, #0046AD 100%) !important;
                color: white !important;
                border: 2px solid #00008f !important;
                box-shadow: 0 0 20px rgba(0, 70, 173, 0.7) !important;
                transform: scale(1.08);
                transition: all 0.3s ease;
                position: relative;
                z-index: 1;
                cursor: pointer;
            `;

            const style = document.createElement('style');
            style.id = 'axa-highlight-style';
            style.textContent = `
                @keyframes rippleEffect {
                    0% { width: 10px; height: 10px; opacity: 1; border-width: 3px; }
                    100% { width: 180px; height: 180px; opacity: 0; border-width: 1px; }
                }
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(0, 70, 173, 0.7); }
                    50% { box-shadow: 0 0 35px rgba(0, 70, 173, 0.9); }
                }
            `;
            document.head.appendChild(style);

            targetBtn.style.animation = 'pulse 1s ease-in-out infinite';

            function createRipple() {
                const ripple = document.createElement('span');
                ripple.className = 'axa-ripple';
                ripple.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 10px;
                    height: 10px;
                    background: transparent;
                    border: 3px solid rgba(0, 70, 173, 0.8);
                    border-radius: 50%;
                    animation: rippleEffect 1.8s ease-out infinite;
                    pointer-events: none;
                    z-index: 0;
                `;
                wrapper.appendChild(ripple);

                setTimeout(() => {
                    const ripple2 = document.createElement('span');
                    ripple2.className = 'axa-ripple';
                    ripple2.style.cssText = ripple.style.cssText;
                    wrapper.appendChild(ripple2);
                }, 600);
            }

            createRipple();

            setTimeout(() => {
                const ripples = wrapper.querySelectorAll('.axa-ripple');
                ripples.forEach(r => r.remove());
                targetBtn.style.cssText = originalStyle;
                targetBtn.style.animation = '';
                if (style.parentNode) style.remove();

                if (wrapper.parentNode) {
                    wrapper.parentNode.insertBefore(targetBtn, wrapper);
                    wrapper.remove();
                }
            }, 6000);

            console.log('[Export Client] ✅ Import terminé !');
        }

        setTimeout(waitForFuncMenuAndExecute, 1000);
    }

})();
