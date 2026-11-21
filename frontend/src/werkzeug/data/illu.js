// Illustrationen für Wiki-Artikel (```illustration-Blöcke), aus dem Ideler-Portal.
export const ILLU={
'passkey-prinzip':`<svg viewBox="0 0 800 370" role="img" aria-label="Anmeldung mit Passkey: Die Website schickt eine Aufgabe, das Handy unterschreibt sie mit dem privaten Schlüssel, die Website prüft mit dem öffentlichen Schlüssel.">
<defs><marker id="ilA1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9FB3C8"/></marker></defs>
<rect x="40" y="30" width="170" height="270" rx="26" fill="#11233A" stroke="#5CE1E6" stroke-width="2"/><rect x="100" y="44" width="50" height="6" rx="3" fill="#2A4462"/>
<g transform="translate(125 120)"><circle cx="-24" cy="0" r="18" fill="none" stroke="#FFB547" stroke-width="7"/><path d="M-6 0H38M26 0v14M36 0v10" stroke="#FFB547" stroke-width="7" stroke-linecap="round"/></g>
<text x="125" y="176" text-anchor="middle" class="t-strong">Privater Schlüssel</text><text x="125" y="198" text-anchor="middle" class="t-dim">verlässt das Gerät nie</text>
<circle cx="125" cy="252" r="25" fill="#17304B" stroke="#5CE1E6" stroke-width="1.5"/><path d="M113 262c0-11 5-19 12-19s12 7 12 15M118 266c0-8 3-14 7-14s7 4 7 10M125 268v-9M108 252c2-9 9-15 17-15s15 6 17 14" stroke="#5CE1E6" stroke-width="2" fill="none" stroke-linecap="round"/>
<text x="125" y="330" text-anchor="middle" class="t-dim">Entsperren mit Finger,</text><text x="125" y="350" text-anchor="middle" class="t-dim">Gesicht oder PIN</text>
<rect x="590" y="30" width="170" height="270" rx="16" fill="#11233A" stroke="#9FB3C8" stroke-width="2"/><text x="675" y="64" text-anchor="middle" class="t-strong">Website</text>
<path d="M660 128v-14a15 15 0 0 1 30 0v14" stroke="#5CE1E6" stroke-width="7" fill="none"/><rect x="650" y="126" width="50" height="40" rx="7" fill="#5CE1E6"/><circle cx="675" cy="144" r="5" fill="#11233A"/><path d="M675 146v8" stroke="#11233A" stroke-width="4"/>
<text x="675" y="196" text-anchor="middle" class="t-strong">Öffentlicher Schlüssel</text><text x="675" y="218" text-anchor="middle" class="t-dim">ist wie ein Schloss:</text><text x="675" y="238" text-anchor="middle" class="t-dim">darf jeder sehen</text>
<circle cx="675" cy="272" r="15" fill="#74E3A8"/><path d="M668 272l5 5 9-10" stroke="#0A1626" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<line x1="585" y1="100" x2="220" y2="100" stroke="#9FB3C8" stroke-width="2" marker-end="url(#ilA1)"/>
<circle cx="268" cy="80" r="12" fill="#17304B" stroke="#9FB3C8"/><text x="268" y="85" text-anchor="middle" class="t-num">1</text><text x="290" y="85" class="t-lab">Website schickt eine Aufgabe</text>
<line x1="220" y1="180" x2="585" y2="180" stroke="#FFB547" stroke-width="2.5" marker-end="url(#ilA1)"/>
<circle cx="268" cy="160" r="12" fill="#17304B" stroke="#FFB547"/><text x="268" y="165" text-anchor="middle" class="t-num">2</text><text x="290" y="165" class="t-lab">Handy unterschreibt mit dem Schlüssel</text>
<circle cx="268" cy="262" r="12" fill="#17304B" stroke="#74E3A8"/><text x="268" y="267" text-anchor="middle" class="t-num">3</text><text x="290" y="260" class="t-lab">Website prüft mit dem Schloss</text><text x="290" y="282" class="t-dim">Passt die Unterschrift: angemeldet.</text>
</svg>`,
'passkey-phishing':`<svg viewBox="0 0 800 300" role="img" aria-label="Ein Passkey funktioniert nur auf der echten Website. Auf einer gefälschten Adresse gibt es keinen passenden Passkey.">
<defs><marker id="ilA2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#74E3A8"/></marker></defs>
<rect x="40" y="80" width="120" height="190" rx="22" fill="#11233A" stroke="#5CE1E6" stroke-width="2"/>
<g transform="translate(100 150)"><circle cx="-16" cy="0" r="13" fill="none" stroke="#FFB547" stroke-width="5"/><path d="M-3 0H28M19 0v10M27 0v7" stroke="#FFB547" stroke-width="5" stroke-linecap="round"/></g>
<text x="100" y="200" text-anchor="middle" class="t-dim">Passkey für</text><text x="100" y="220" text-anchor="middle" class="t-strong">paypal.com</text>
<path d="M165 130C260 90 330 70 455 70" stroke="#74E3A8" stroke-width="2.5" fill="none" marker-end="url(#ilA2)"/>
<text x="300" y="62" text-anchor="middle" class="t-ok">passt</text>
<path d="M165 220C260 240 300 240 375 240" stroke="#FF8A7A" stroke-width="2.5" fill="none" stroke-dasharray="6 6"/>
<circle cx="392" cy="240" r="15" fill="#FF8A7A"/><path d="M386 234l12 12M398 234l-12 12" stroke="#0A1626" stroke-width="3" stroke-linecap="round"/>
<text x="290" y="272" text-anchor="middle" class="t-bad">kein passender Passkey</text>
<rect x="460" y="30" width="310" height="100" rx="14" fill="#11233A" stroke="#74E3A8" stroke-width="2"/>
<text x="480" y="62" class="t-mono t-ok">paypal.com</text><text x="480" y="88" class="t-strong">Echte Seite</text><text x="480" y="110" class="t-dim">Anmeldung klappt mit einem Fingertipp</text>
<rect x="420" y="190" width="350" height="100" rx="14" fill="#11233A" stroke="#FF8A7A" stroke-width="2"/>
<text x="440" y="222" class="t-mono t-bad">paypal-login-sicher.xyz</text><text x="440" y="248" class="t-strong">Gefälschte Seite</text><text x="440" y="270" class="t-dim">Es gibt nichts, was man abgreifen könnte</text>
</svg>`,
'passkey-geraete':`<svg viewBox="0 0 800 320" role="img" aria-label="Passkeys werden über den Schlüsselbund oder einen Passwort-Manager auf alle eigenen Geräte verteilt. An einem fremden PC meldet man sich per QR-Code mit dem Handy an.">
<circle cx="250" cy="165" r="74" fill="#17304B" stroke="#FFB547" stroke-width="2"/>
<g transform="translate(250 128)"><circle cx="-12" cy="0" r="10" fill="none" stroke="#FFB547" stroke-width="4"/><path d="M-2 0H22M15 0v8M21 0v6" stroke="#FFB547" stroke-width="4" stroke-linecap="round"/></g>
<text x="250" y="168" text-anchor="middle" class="t-strong">Schlüsselbund</text><text x="250" y="188" text-anchor="middle" class="t-dim">iCloud, Google oder</text><text x="250" y="206" text-anchor="middle" class="t-dim">Passwort-Manager</text>
<g stroke="#5CE1E6" stroke-width="2" stroke-dasharray="5 6" fill="none"><path d="M120 60L192 115"/><path d="M110 165H176"/><path d="M120 270L192 215"/></g>
<rect x="58" y="22" width="44" height="76" rx="9" fill="#11233A" stroke="#5CE1E6" stroke-width="2"/><text x="80" y="116" text-anchor="middle" class="t-dim">Handy</text>
<rect x="30" y="138" width="80" height="54" rx="6" fill="#11233A" stroke="#5CE1E6" stroke-width="2"/><text x="70" y="212" text-anchor="middle" class="t-dim">Tablet</text>
<rect x="44" y="244" width="76" height="46" rx="5" fill="#11233A" stroke="#5CE1E6" stroke-width="2"/><path d="M34 296h96" stroke="#5CE1E6" stroke-width="3" stroke-linecap="round"/><text x="82" y="316" text-anchor="middle" class="t-dim">Laptop</text>
<text x="250" y="266" text-anchor="middle" class="t-dim">verschlüsselt abgeglichen</text>
<line x1="420" y1="30" x2="420" y2="300" stroke="#2A4462" stroke-width="2"/>
<text x="610" y="48" text-anchor="middle" class="t-strong">An einem fremden PC</text>
<rect x="470" y="78" width="110" height="80" rx="6" fill="#11233A" stroke="#9FB3C8" stroke-width="2"/><path d="M460 168h130" stroke="#9FB3C8" stroke-width="3" stroke-linecap="round"/>
<g fill="#E8F0F7"><rect x="500" y="90" width="22" height="22"/><rect x="528" y="90" width="22" height="22"/><rect x="500" y="118" width="22" height="22"/><rect x="532" y="122" width="6" height="6"/><rect x="542" y="132" width="8" height="8"/><rect x="528" y="134" width="6" height="6"/></g>
<g fill="#11233A"><rect x="505" y="95" width="12" height="12"/><rect x="533" y="95" width="12" height="12"/><rect x="505" y="123" width="12" height="12"/></g>
<rect x="680" y="84" width="44" height="76" rx="9" fill="#11233A" stroke="#5CE1E6" stroke-width="2"/>
<path d="M592 120H668" stroke="#5CE1E6" stroke-width="2" stroke-dasharray="4 5"/><path d="M630 104c6 4 6 28 0 32M622 110c4 3 4 17 0 20" stroke="#5CE1E6" stroke-width="2" fill="none"/>
<text x="610" y="210" text-anchor="middle" class="t-lab">QR-Code mit dem Handy scannen</text><text x="610" y="234" text-anchor="middle" class="t-dim">Das Handy muss in der Nähe sein</text><text x="610" y="254" text-anchor="middle" class="t-dim">(Bluetooth). Der Passkey bleibt</text><text x="610" y="274" text-anchor="middle" class="t-dim">auf dem Handy.</text>
</svg>`,
'url-anatomie':`<svg viewBox="0 0 800 190" role="img" aria-label="Aufbau einer Webadresse: Entscheidend ist die Domain direkt vor dem ersten Schrägstrich, alles davor ist frei wählbar.">
<text x="30" y="28" class="t-dim">So liest man eine Webadresse: Entscheidend ist der Teil direkt vor dem ersten „/“</text>
<rect x="352" y="52" width="300" height="44" rx="8" fill="rgba(255,181,71,.16)" stroke="#FFB547"/>
<text x="30" y="83" class="t-url" fill="#7489A0" textLength="137" lengthAdjust="spacingAndGlyphs">https://</text>
<text x="168" y="83" class="t-url" fill="#E8F0F7" textLength="188" lengthAdjust="spacingAndGlyphs">paypal.com.</text>
<text x="357" y="83" class="t-url t-urlb" fill="#FFB547" textLength="290" lengthAdjust="spacingAndGlyphs">sicher-login.info</text>
<text x="650" y="83" class="t-url" fill="#7489A0" textLength="102" lengthAdjust="spacingAndGlyphs">/konto</text>
<g fill="none" stroke-width="2"><path d="M32 108v8h134v-8" stroke="#7489A0"/><path d="M170 108v8h178v-8" stroke="#E8F0F7"/><path d="M356 108v8h292v-8" stroke="#FFB547"/><path d="M652 108v8h100v-8" stroke="#7489A0"/></g>
<text x="99" y="142" text-anchor="middle" class="t-dim">Verschlüsselung</text>
<text x="259" y="142" text-anchor="middle" class="t-lab">frei wählbar,</text><text x="259" y="162" text-anchor="middle" class="t-lab">reine Tarnung</text>
<text x="502" y="142" text-anchor="middle" class="t-strong" fill="#FFB547">die echte Domain:</text><text x="502" y="162" text-anchor="middle" class="t-strong" fill="#FFB547">sicher-login.info</text>
<text x="702" y="142" text-anchor="middle" class="t-dim">Seite auf</text><text x="702" y="162" text-anchor="middle" class="t-dim">dem Server</text>
</svg>`,
'backup-321':`<svg viewBox="0 0 800 270" role="img" aria-label="3-2-1-Regel: drei Kopien, zwei verschiedene Speicher, eine Kopie außer Haus.">
<g><rect x="20" y="20" width="240" height="200" rx="16" fill="#11233A" stroke="#2A4462"/><text x="50" y="80" class="t-big">3</text><text x="98" y="58" class="t-strong">Kopien</text><text x="98" y="80" class="t-dim">Original + 2 Sicherungen</text>
<g fill="#17304B" stroke="#5CE1E6" stroke-width="2"><path d="M60 110h40l14 14v56H60z"/><path d="M120 110h40l14 14v56h-54z"/><path d="M180 110h40l14 14v56h-54z"/></g></g>
<g><rect x="280" y="20" width="240" height="200" rx="16" fill="#11233A" stroke="#2A4462"/><text x="310" y="80" class="t-big">2</text><text x="358" y="58" class="t-strong">Speicherarten</text><text x="358" y="80" class="t-dim">z. B. PC und Festplatte</text>
<rect x="312" y="112" width="96" height="62" rx="6" fill="#17304B" stroke="#5CE1E6" stroke-width="2"/><path d="M346 184h28M360 174v10" stroke="#5CE1E6" stroke-width="2.5"/>
<rect x="430" y="116" width="58" height="72" rx="10" fill="#17304B" stroke="#FFB547" stroke-width="2"/><circle cx="459" cy="146" r="12" fill="none" stroke="#FFB547" stroke-width="2"/><circle cx="459" cy="146" r="3" fill="#FFB547"/></g>
<g><rect x="540" y="20" width="240" height="200" rx="16" fill="#11233A" stroke="#2A4462"/><text x="570" y="80" class="t-big">1</text><text x="618" y="58" class="t-strong">Kopie außer Haus</text><text x="618" y="80" class="t-dim">Cloud oder 2. Standort</text>
<path d="M580 180v-40l30-24 30 24v40z" fill="#17304B" stroke="#5CE1E6" stroke-width="2"/><path d="M650 150h34" stroke="#9FB3C8" stroke-width="2" stroke-dasharray="4 4"/>
<path d="M700 176h52a18 18 0 0 0 0-36 26 26 0 0 0-50-6 16 16 0 0 0-2 42z" fill="#17304B" stroke="#FFB547" stroke-width="2"/></g>
<text x="400" y="252" text-anchor="middle" class="t-lab">Mindestens eine Kopie offline aufbewahren, damit ein Erpressungstrojaner sie nicht erreicht.</text>
</svg>`,
};
