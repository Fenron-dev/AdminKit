// Mail-Diagnose – aus dem Ideler-Portal übernommen (Unzustellbarkeitsberichte,
// Kopfzeilen, Spam-Gründe). Neu: .eml-Datei öffnen oder ablegen. Alles lokal.
import { $, esc, ic, chk } from '../ui.js';
import { fmtTime } from './units.js';
import { REF } from '../data/ref.js';

let lastText = '';

export const BOUNCE=[
  {re:/5\.7\.26|5\.7\.509|unauthenticated|\bdmarc\b[^\n]{0,60}(fail|reject|policy)/i,t:'Absender nicht ausreichend authentifiziert (DMARC)',why:'Der Empfänger konnte nicht sicher feststellen, dass die Mail wirklich von der Absenderdomain kommt. SPF und DKIM fehlen oder passen nicht. Gmail, Yahoo und Microsoft lehnen solche Mails inzwischen häufig ab.',fix:['SPF-Eintrag der Absenderdomain prüfen: Ist der Server, über den die Mail rausging, enthalten?','DKIM für die Domain aktivieren, beim Hoster in den Mail-Einstellungen der Domain (z. B. Plesk).','DMARC-Eintrag anlegen, falls er fehlt.','Mit dem Mail-Check die Domain prüfen.'],dns:'from'},
  {re:/5\.7\.23|\bspf\b[^\n]{0,50}(fail|not permitted|not authori[sz]ed|nicht berechtigt)/i,t:'SPF-Prüfung fehlgeschlagen',why:'Der sendende Server steht nicht im SPF-Eintrag der Absenderdomain. Für den Empfänger sieht das aus wie eine gefälschte Mail.',fix:['Herausfinden, über welchen Server gesendet wurde (z. B. Mailprogramm mit falschem Postausgangsserver, Kopierer/Scanner, Shop-System).','Diesen Server im SPF-Eintrag ergänzen oder über den richtigen Postausgangsserver senden.'],dns:'from'},
  {re:/5\.7\.25|reverse dns|\bPTR\b|\brDNS\b|reverse (lookup|mapping)/i,t:'Fehlende Rückwärtsauflösung (PTR)',why:'Die IP-Adresse des sendenden Servers hat keinen passenden Namen im DNS. Viele Empfänger nehmen von solchen Servern keine Mails an.',fix:['PTR-Eintrag beim Anbieter der IP-Adresse (Hoster oder Internetanbieter) setzen lassen.','Er sollte auf den Hostnamen des Mailservers zeigen, der wiederum auf die IP zeigt.']},
  {re:/spamhaus|block ?list|black ?list|\bdnsbl\b|\brbl\b|barracuda|spamcop|\bsorbs\b|\blisted\b|5\.7\.606|5\.7\.708|banned sending ip|traffic not accepted from this ip/i,t:'Server-IP steht auf einer Sperrliste',why:'Die IP-Adresse, über die gesendet wurde, ist als Spam-Quelle gelistet. Oft steckt ein gehacktes Postfach oder ein infizierter Rechner dahinter, manchmal nur ein schlechter Ruf des Netzbereichs.',fix:['IP bei MXToolbox auf Sperrlisten prüfen.','Ursache beseitigen: Postfächer auf ungewöhnlichen Versand prüfen, Passwörter ändern, Rechner auf Schadsoftware prüfen.','Danach Entfernung bei der jeweiligen Liste beantragen (bei Microsoft über sender.office.com).']},
  {re:/sending limit|rate limit|too many (messages|recipients|connections)|5\.7\.750|5\.1\.8\b|bad outbound sender|daily (sending )?quota|limit exceeded/i,t:'Versandlimit erreicht oder Absender gesperrt',why:'Das Postfach hat mehr Mails verschickt als erlaubt, oder der Anbieter hat es wegen Spamverdacht für den Versand gesperrt. Häufigste Ursache ist ein gehacktes Passwort.',fix:['Gesendete Elemente und Postausgang auf unbekannte Mails prüfen.','Passwort sofort ändern und Zwei-Faktor-Anmeldung aktivieren.','Bei Microsoft 365 muss ein Administrator die Sperre im Admin Center aufheben.']},
  {re:/relay(ing)? (access )?(denied|not permitted)|not permitted to relay|unable to relay|relay not permitted|authentication required|must authenticate|smtp auth/i,t:'Versand ohne Anmeldung am Postausgangsserver',why:'Der Server leitet Mails nur weiter, wenn sich das Mailprogramm mit Benutzername und Passwort anmeldet. Das ist im Programm nicht eingestellt oder die Zugangsdaten stimmen nicht.',fix:['Im Mailprogramm beim Postausgangsserver (SMTP) „Authentifizierung erforderlich“ aktivieren.','Port 587 mit STARTTLS oder 465 mit SSL/TLS verwenden, nicht Port 25.','Bei Scannern und Kopierern ebenfalls Benutzername und Passwort für SMTP hinterlegen.']},
  {re:/sender (address )?rejected|sender (domain )?(unknown|not found|denied|not allowed)|5\.1\.7\b|from address (rejected|not allowed)/i,t:'Absenderadresse abgelehnt',why:'Die Absenderadresse ist ungültig, gehört nicht zum angemeldeten Konto oder ihre Domain ist im DNS nicht auffindbar.',fix:['Prüfen, ob die Absenderadresse im Mailprogramm korrekt eingetragen ist.','Mit Konto A angemeldet, aber als Adresse B gesendet? Das erlauben viele Server nicht.']},
  {re:/5\.1\.1\b|5\.1\.10\b|5\.4\.1\b|user unknown|unknown user|no such (user|mailbox|recipient)|does ?n[o']t exist|recipient (address )?rejected|unknown recipient|recipient not found|mailbox (not found|unavailable)|invalid recipient|recipnotfound|unbekannt|existiert nicht/i,t:'Empfängeradresse existiert nicht',why:'Beim Empfänger gibt es kein Postfach mit dieser Adresse. Meist ist es ein Tippfehler, oder die Person ist nicht mehr dort.',fix:['Adresse Zeichen für Zeichen prüfen, besonders die Domain (z. B. gmial.com, t-onlien.de).','Im Mailprogramm gespeicherte Vorschläge löschen, falls dort eine alte Adresse hängt.','Den Empfänger auf anderem Weg nach der richtigen Adresse fragen.']},
  {re:/5\.2\.2\b|4\.2\.2\b|mailbox (is )?full|over ?quota|quota exceeded|insufficient (system )?storage|postfach[^\n]{0,20}voll|speicherplatz/i,t:'Postfach des Empfängers ist voll',why:'Der Empfänger hat seinen Speicherplatz ausgeschöpft. Daran kann der Absender nichts ändern.',fix:['Dem Empfänger auf anderem Weg Bescheid geben.','Später erneut senden.']},
  {re:/5\.2\.1\b|(mailbox|account) (is )?(disabled|inactive|suspended)|deaktiviert/i,t:'Postfach des Empfängers ist deaktiviert',why:'Das Postfach existiert, nimmt aber keine Mails an, etwa nach Kündigung oder Sperre.',fix:['Empfänger nach einer aktuellen Adresse fragen.']},
  {re:/5\.3\.4\b|5\.2\.3\b|message (size|too (big|large))|size (limit|exceeds)|exceeds (the )?(maximum|size)|too large|zu gro(ß|ss)/i,t:'Mail ist zu groß',why:'Die Mail mitsamt Anhängen überschreitet die erlaubte Größe beim Empfänger, oft 10 bis 25 MB. Anhänge werden beim Versand zudem um etwa ein Drittel größer.',fix:['Große Dateien über einen Dateitransfer-Dienst oder eine Cloud-Freigabe als Link schicken.','Bilder verkleinern oder als ZIP komprimieren.']},
  {re:/5\.1\.2\b|5\.4\.4\b|host (or domain name )?not found|domain (not found|does not exist)|no mx|unrouteable|name service error|nxdomain/i,t:'Empfängerdomain nicht gefunden',why:'Für die Domain hinter dem @ gibt es keinen Mailserver. Meist ein Tippfehler in der Domain oder die Domain ist abgelaufen.',fix:['Domain in der Adresse prüfen.','Mit dem Mail-Check prüfen, ob die Domain MX-Einträge hat.'],dns:'rcpt'},
  {re:/starttls|tls (is )?required|must issue a starttls|encryption required|certificate (verify|verification)|5\.7\.10\b|5\.7\.11\b/i,t:'Verschlüsselung (TLS) fehlgeschlagen',why:'Einer der beiden Server verlangt eine verschlüsselte Verbindung, die nicht zustande kam, etwa wegen eines abgelaufenen Zertifikats.',fix:['Zertifikat des Mailservers prüfen (z. B. in Plesk unter SSL/TLS-Zertifikate).','Im Mailprogramm die Verschlüsselung auf STARTTLS bzw. SSL/TLS stellen.']},
  {re:/4\.4\.7\b|expired|retry time|delivery time expired|giving up|could not be delivered within|zeitüberschreitung/i,t:'Zustellung nach Wartezeit aufgegeben',why:'Der Server hat es über Stunden oder Tage immer wieder versucht und gibt jetzt auf. Der Empfängerserver war nicht erreichbar oder hat dauerhaft vorläufig abgelehnt.',fix:['Erneut senden.','Wenn es wieder passiert: Mail-Check auf die Empfängerdomain und den Empfänger informieren.'],dns:'rcpt'},
  {re:/greylist|try again later|temporar(il)?y|deferred|\b4[25]\d[ -]4\.\d|(^|\s)4\.\d\.\d{1,3}\b|delayed|verzögert|noch nicht zugestellt/im,t:'Vorübergehende Verzögerung',why:'Der Empfängerserver hat die Mail vorläufig zurückgestellt, oft durch Greylisting (Schutz, bei dem der erste Versuch absichtlich abgewiesen wird). Der sendende Server versucht es automatisch erneut.',fix:['Abwarten, meist kommt die Mail nach Minuten bis wenigen Stunden an.','Erst wenn nach 1 bis 2 Tagen eine endgültige Fehlermeldung kommt, handeln.']},
  {re:/spam|content rejected|message (content )?rejected|5\.7\.1\b|policy|blocked|554[ -]5\.7|unsolicited|virus|malware|attachment[^\n]{0,30}(not allowed|blocked)/i,t:'Abgelehnt wegen Inhalt oder Richtlinie',why:'Der Empfängerserver hält die Mail für Spam oder sie verstößt gegen eine Regel, zum Beispiel wegen eines Anhangs, eines Links oder eines schlechten Rufs des Absenders.',fix:['Erneut ohne Anhang oder Link senden, um die Ursache einzugrenzen.','Anhänge wie .exe, .js oder Office-Dateien mit Makros werden oft blockiert. Besser als Link teilen.','Mail-Check auf die Absenderdomain machen: Fehlen SPF, DKIM oder DMARC?'],dns:'from'},
];
export const SA_TESTS=[[/^BAYES_(9\d|8\d)/,'Inhalt ähnelt stark bekanntem Spam (Lernfilter).'],[/^BAYES_(5\d|6\d|7\d)/,'Lernfilter unentschieden.'],[/^BAYES_(0\d|[1-4]\d)/,'Lernfilter hält die Mail eher für harmlos.'],[/SPF_FAIL/,'Sendeserver steht nicht im SPF-Eintrag (hart).'],[/SPF_SOFTFAIL/,'Sendeserver steht nicht im SPF-Eintrag (weich).'],[/SPF_NONE|SPF_HELO_NONE/,'Kein SPF-Eintrag vorhanden.'],[/SPF_PASS/,'SPF bestanden.'],
  [/DKIM_INVALID|DKIM_BAD|T_DKIM_INVALID/,'DKIM-Signatur ungültig.'],[/DKIM_NONE|NO_DKIM/,'Mail ist nicht DKIM-signiert.'],[/DKIM_VALID|DKIM_SIGNED/,'Mail ist gültig DKIM-signiert.'],[/DMARC_(FAIL|REJECT|QUAR|NONE)/,'DMARC-Prüfung nicht bestanden.'],[/RDNS_NONE/,'Sendender Server hat keine Rückwärtsauflösung (PTR).'],[/RDNS_DYNAMIC|DYN_RDNS/,'Sendende IP sieht nach Privatanschluss aus.'],
  [/RCVD_IN_(SBL|XBL|PBL|ZEN|BL_SPAMCOP|MSPIKE_BL|SORBS|PSBL|UCEPROTECT)/,'Sendende IP steht auf einer Sperrliste.'],[/RCVD_IN_DNSWL|RCVD_IN_MSPIKE_H/,'Sendende IP steht auf einer Positivliste.'],[/URIBL_|SURBL|DBL_SPAM|URI_BLACK/,'Ein Link zeigt auf eine als Spam bekannte Domain.'],[/^HTML_MESSAGE$/,'Mail enthält HTML (unkritisch, kleiner Wert).'],[/HTML_IMAGE_ONLY|HTML_IMAGE_RATIO/,'Viel Bild, wenig Text.'],[/MIME_HTML_ONLY/,'Nur HTML ohne Textteil.'],
  [/MISSING_(DATE|MID|HEADERS|SUBJECT)/,'Wichtige Kopfzeilen fehlen.'],[/FREEMAIL_FORGED|FREEMAIL_REPLYTO/,'Antwortadresse weicht vom Freemail-Absender ab.'],[/FREEMAIL_FROM/,'Absender nutzt einen Freemail-Dienst.'],[/SUBJ_ALL_CAPS/,'Betreff in Großbuchstaben.'],[/PYZOR|RAZOR2|DCC_CHECK/,'Inhalt ist in gemeinsamen Spam-Datenbanken bekannt.'],
  [/LOTS_OF_MONEY|ADVANCE_FEE|MONEY_|FILL_THIS_FORM/,'Typische Geld- oder Formular-Formulierungen.'],[/EMPTY_MESSAGE|EMPTY_BODY/,'Mail ist leer.'],[/ALL_TRUSTED/,'Kam nur über vertrauenswürdige Server.'],[/TO_NO_BRKTS|TO_MALFORMED/,'Empfängerfeld ungewöhnlich formatiert.'],[/FORGED_|SPOOF/,'Absenderangaben sehen gefälscht aus.']];
export const ENH_CLASS={'2':'Erfolg','4':'vorübergehender Fehler, es wird automatisch erneut versucht','5':'dauerhafter Fehler, es wird nicht erneut versucht'};
export const ENH_SUBJ={'0':'Sonstiges','1':'Adresse','2':'Postfach','3':'Mailsystem','4':'Netzwerk und Weiterleitung','5':'Zustellprotokoll','6':'Inhalt und Format','7':'Sicherheit und Richtlinien'};
export function parseHdr(raw){const out=[];let cur=null;for(const l of raw.replace(/\r\n?/g,'\n').split('\n')){if(/^[ \t]+\S/.test(l)&&cur){cur.v+=' '+l.trim();continue}
  const m=l.match(/^([A-Za-z][A-Za-z0-9-]{1,60}):[ \t]*(.*)$/);if(m){cur={k:m[1].toLowerCase(),v:m[2].trim()};out.push(cur)}else cur=null}return out}
export const addrOf=v=>{const m=String(v||'').match(/<([^>]+)>/)||String(v||'').match(/([^\s<>"]+@[^\s<>"]+)/);return m?m[1].toLowerCase():''};
export const domOf=a=>(a.split('@')[1]||'').replace(/[>\s].*$/,'');
export const SL2=new Set(['co.uk','org.uk','ac.uk','gov.uk','com.au','net.au','org.au','co.at','or.at','gv.at','co.nz','co.jp','ne.jp','or.jp','com.br','com.cn','com.tr','co.za','com.mx','co.in','com.pl','com.es','co.il','com.sg','com.hk','com.tw','co.kr','com.ua']);
export const regDom=h=>{h=String(h||'').toLowerCase();if(/^[\d.]+$/.test(h)||h.includes(':'))return h;const p=h.split('.');if(p.length<=2)return h;const l2=p.slice(-2).join('.');return SL2.has(l2)?p.slice(-3).join('.'):l2};
export function analyzeMail(raw){
  const H=parseHdr(raw),get=k=>H.filter(h=>h.k===k).map(h=>h.v),one=k=>get(k)[0];const S2=[];
  // Bounce
  const hits=BOUNCE.filter(b=>b.re.test(raw));
  const codes=[...new Set([...raw.matchAll(/(?:^|[\s(;'"=#-])([245]\.\d{1,2}\.\d{1,3})(?=[\s);'",.\]]|$)/gm)].map(m=>m[1]))].slice(0,6);
  const isBounce=hits.length&&(codes.length||/mailer-daemon|postmaster|delivery (status|failure|has failed)|undeliver|unzustellbar|returned mail|could not be delivered|nicht zugestellt|diagnostic-code|final-recipient|non-?delivery/i.test(raw));
  const replyLines=raw.split(/\r?\n/).filter(l=>/(\b[245]\d\d[ -])|([245]\.\d{1,2}\.\d{1,3})|diagnostic-code/i.test(l)&&!/^(received|date|message-id|x-|dkim|arc-)/i.test(l)).slice(0,6).map(s=>s.trim());
  const dsn=['final-recipient','action','status','remote-mta','reporting-mta','diagnostic-code'].map(k=>[k,one(k)]).filter(x=>x[1]);
  // Auth
  const ar=get('authentication-results').join(' ; ')||get('arc-authentication-results').join(' ; ');const auth={};
  for(const k of ['spf','dkim','dmarc','compauth']){const m=ar.match(new RegExp('\\b'+k+'=(\\w+)','i'));if(m)auth[k]=m[1].toLowerCase()}
  const rs=one('received-spf');if(!auth.spf&&rs)auth.spf=(rs.match(/^(\w+)/)||[])[1]?.toLowerCase();
  // Spam
  const spam=[];let isSpam=false;const sa=one('x-spam-status');let tests=[];
  if(sa){const m=sa.match(/^(yes|no)/i),sc=sa.match(/score=(-?[\d.]+)/i),rq=sa.match(/required=(-?[\d.]+)/i),tm=sa.match(/tests=([A-Z0-9_]+(?:\s*,\s*[A-Z0-9_]+)*)/i);
    if(m&&/yes/i.test(m[1]))isSpam=true;if(tm)tests=tm[1].split(/,\s*/).filter(t=>/^[A-Z0-9_]+$/.test(t)&&t!=='none');
    spam.push(`SpamAssassin: <b>${sc?esc(sc[1]):'?'}</b> Punkte${rq?`, ab ${esc(rq[1])} gilt als Spam`:''}${m?` → <b>${/yes/i.test(m[1])?'Spam':'kein Spam'}</b>`:''}`)}
  const flag=one('x-spam-flag');if(flag&&/yes/i.test(flag)){isSpam=true;if(!sa)spam.push('X-Spam-Flag: <b>YES</b>')}
  const xs=one('x-spam-score');if(xs&&!sa)spam.push(`Spam-Punktzahl: <b>${esc(xs)}</b>`);
  const rsd=one('x-spamd-result')||one('x-rspamd-score');if(rsd){spam.push(`Rspamd: ${esc(rsd.slice(0,80))}`);const ac=one('x-rspamd-action');if(ac&&!/no action/i.test(ac)){isSpam=true;spam.push(`Rspamd-Aktion: <b>${esc(ac)}</b>`)}}
  const scl=one('x-ms-exchange-organization-scl')||((one('x-forefront-antispam-report')||'').match(/SCL:(-?\d)/)||[])[1];
  if(scl!=null&&scl!==''){const n=+scl;if(n>=5)isSpam=true;spam.push(`Microsoft SCL: <b>${n}</b> (${n<0?'vertrauenswürdig, Filter übersprungen':n<=1?'kein Spam':n<5?'leicht verdächtig':'Spam, geht in den Junk-Ordner'})`)}
  const ff=one('x-forefront-antispam-report')||'';if(/SFV:SPM/i.test(ff)){isSpam=true;spam.push('Microsoft-Filter: <b>als Spam eingestuft</b> (SFV:SPM)')}const cat=(ff.match(/CAT:(\w+)/)||[])[1];if(cat&&cat!=='NONE')spam.push(`Microsoft-Kategorie: <b>${esc(cat)}</b>${{PHSH:' (Phishing)',SPM:' (Spam)',BULK:' (Massenmail)',HPHSH:' (sicheres Phishing)',MALW:' (Schadsoftware)',SPOOF:' (Fälschung)'}[cat]||''}`);
  const bcl=(String(one('x-microsoft-antispam')||'').match(/BCL:(\d)/)||[])[1];if(bcl)spam.push(`Microsoft BCL (Massenmail): <b>${bcl}</b> von 9`);
  const ui=one('x-ui-filterresults');if(ui){const j=(ui.match(/junk:(\d+)/i)||[])[1];spam.push(`GMX/WEB.DE-Filter: ${esc(ui.slice(0,60))}`);if(j&&+j>=8)isSpam=true}
  // Sender
  const from=one('from'),rp=one('return-path'),rt=one('reply-to'),fa=addrOf(from),fd=regDom(domOf(fa)),snd=[];
  if(fa){if(rt){const rd=regDom(domOf(addrOf(rt)));if(rd&&rd!==fd)snd.push(['warn','Antworten gehen an eine andere Domain',`Absender <span class="mono">${esc(fa)}</span>, Antwort an <span class="mono">${esc(addrOf(rt))}</span>. Typisch für Betrugsmails, bei Newslettern aber auch üblich.`])}
    if(rp){const pd=regDom(domOf(addrOf(rp)));if(pd&&pd!==fd)snd.push(['info','Technischer Absender weicht ab',`Return-Path <span class="mono">${esc(addrOf(rp))}</span>. Normal bei Newsletter-Diensten und Weiterleitungen, DMARC prüft dann über DKIM.`])}
    const dn=String(from).replace(/<[^>]*>/,'');const dna=(dn.match(/[^\s"'<>]+@[^\s"'<>]+/)||[])[0];if(dna&&dna.toLowerCase()!==fa)snd.push(['err','Anzeigename enthält eine andere Adresse',`Angezeigt wird <span class="mono">${esc(dna)}</span>, tatsächlich gesendet von <span class="mono">${esc(fa)}</span>. Klassischer Trick von Phishing-Mails.`])}
  // Hops
  const hops=get('received').map(v=>{const date=Date.parse(v.slice(v.lastIndexOf(';')+1).replace(/\([^)]*\)/g,'').trim());
    return {from:(v.match(/\bfrom\s+(\S+)/i)||[])[1]||'',ip:(v.match(/\[((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]{3,})\]/i)||[])[1]||'',by:(v.match(/\bby\s+(\S+)/i)||[])[1]||'',date}}).reverse();
  return {H,hits,codes,isBounce,replyLines,dsn,auth,ar,spam,tests,isSpam,fa,fd,snd,hops,subject:one('subject'),rcpt:addrOf(one('final-recipient')||one('original-recipient')||one('to')||'')};
}
export const AUTHX={pass:['ok','bestanden'],fail:['err','fehlgeschlagen'],softfail:['warn','weich fehlgeschlagen'],neutral:['warn','neutral'],none:['warn','nicht vorhanden'],temperror:['warn','vorübergehender Fehler'],permerror:['err','fehlerhafter Eintrag'],policy:['warn','Richtlinie'],bestguesspass:['info','vermutlich bestanden']};
export const AUTHD={spf:'Durfte der sendende Server für diese Domain senden?',dkim:'Ist die Mail unterwegs unverändert und digital signiert?',dmarc:'Passen SPF oder DKIM zur sichtbaren Absenderdomain?',compauth:'Microsofts Gesamtbewertung der Absender-Echtheit.'};
export const SAMPLE_BOUNCE=`From: MAILER-DAEMON@mail.beispiel-hosting.de (Mail Delivery System)
To: info@beispiel-kunde.de
Subject: Undelivered Mail Returned to Sender
Date: Mon, 16 Nov 2026 10:14:03 +0100

This is the mail system at host mail.beispiel-hosting.de.

I'm sorry to have to inform you that your message could not
be delivered to one or more recipients.

<anna.schmidt@gmail.com>: host gmail-smtp-in.l.google.com[198.51.100.27] said:
    550-5.7.26 This mail has been blocked because the sender is
    550-5.7.26 unauthenticated. Gmail requires all senders to authenticate
    550 5.7.26 with either SPF or DKIM. (in reply to end of DATA command)

Reporting-MTA: dns; mail.beispiel-hosting.de
Final-Recipient: rfc822; anna.schmidt@gmail.com
Action: failed
Status: 5.7.26
Remote-MTA: dns; gmail-smtp-in.l.google.com
Diagnostic-Code: smtp; 550-5.7.26 This mail has been blocked because the sender is unauthenticated.`;
export const SAMPLE_SPAM=`Return-Path: <bounce-7731@mailer.versandtool.example>
Received: from mx01.empfaenger.example (mx01.empfaenger.example [192.0.2.10])
	by mail.empfaenger.example with ESMTPS id 4F2A1
	for <kunde@empfaenger.example>; Tue, 17 Nov 2026 09:42:51 +0100
Received: from smtp.shop-sendet.example (dsl-203-0-113-45.dyn.example.net [203.0.113.45])
	by mx01.empfaenger.example with ESMTP id 9B7C2
	for <kunde@empfaenger.example>; Tue, 17 Nov 2026 09:42:49 +0100
Received: from pc-buero (unknown [192.168.1.20])
	by smtp.shop-sendet.example with ESMTPSA id 11AA;
	Tue, 17 Nov 2026 09:31:12 +0100
Authentication-Results: mx01.empfaenger.example;
	spf=softfail smtp.mailfrom=versandtool.example;
	dkim=none;
	dmarc=fail (p=none) header.from=shop-sendet.example
X-Spam-Status: Yes, score=7.4 required=5.0 tests=BAYES_50,HTML_MESSAGE,
	RDNS_DYNAMIC,SPF_SOFTFAIL,RCVD_IN_PBL,SUBJ_ALL_CAPS autolearn=no
X-Spam-Flag: YES
From: "Shop Sendet" <info@shop-sendet.example>
Reply-To: rechnung@andere-domain.example
To: kunde@empfaenger.example
Subject: IHRE RECHNUNG NOVEMBER
Date: Tue, 17 Nov 2026 09:31:10 +0100
Message-ID: <abc123@pc-buero>`;

export default {
  id: 'mail', name: 'Mail-Diagnose', group: 'Netzwerk & Mail', icon: 'mail',
  keys: 'mail header bounce unzustellbar spam abgelehnt ndr eml', online: false,
  render(p, ctx) {
  p.innerHTML=`<div class="util wide"><h3>Mail-Diagnose</h3><p>Warum kam eine Mail nicht an, wurde abgelehnt oder landete im Spam? Fehlermeldung (Unzustellbarkeitsbericht) oder Kopfzeilen der Mail hier einfügen. Alles wird lokal ausgewertet.</p>
    <details class="howto"><summary>${ic('info')}So kommst du an die Kopfzeilen oder die Fehlermeldung</summary><div class="howto-b">
      <p><b>Unzustellbar-Mail:</b> Die zurückgekommene Mail öffnen und den gesamten Text kopieren. Am aussagekräftigsten ist der Teil mit „Diagnostic-Code“ oder der dreistelligen Nummer wie 550.</p>
      <p><b>Outlook (Windows):</b> Mail per Doppelklick öffnen, Datei > Eigenschaften, Feld „Internetkopfzeilen“. <b>Outlook im Web / neues Outlook:</b> Drei Punkte > Anzeigen > Nachrichtendetails.</p>
      <p><b>Gmail:</b> Drei Punkte neben „Antworten“ > Original anzeigen. <b>Thunderbird:</b> Strg + U. <b>Apple Mail:</b> Darstellung > E-Mail > Alle Header.</p>
      <p><b>GMX und WEB.DE:</b> Mail öffnen, über das Menü „Mailheader anzeigen“ bzw. „Quelltext“. <b>iPhone und Android:</b> Dort geht es meist nicht. Mail an dich selbst weiterleiten und am PC prüfen.</p></div></details>
    <label class="field"><span class="sr">Mailtext oder Kopfzeilen</span><textarea class="input" id="mlIn" rows="9" spellcheck="false" placeholder="Hier die Fehlermeldung oder die Kopfzeilen einfügen">${esc(lastText)}</textarea></label>
    <div class="row"><button class="btn primary" type="button" id="mlGo">${ic('search')}Analysieren</button><button class="btn ghost" type="button" id="mlB1">Beispiel: abgelehnte Mail</button><button class="btn ghost" type="button" id="mlB2">Beispiel: im Spam gelandet</button><button class="btn ghost" type="button" id="mlClr">Leeren</button><button class="btn" type="button" id="mlEml">${ic('upload')}E-Mail-Datei öffnen (.eml)</button></div>
    <div id="mlOut" aria-live="polite"></div></div>`;
  const ta=$('#mlIn',p),out=$('#mlOut',p);
  const run=()=>{lastText=ta.value;if(!ta.value.trim()){out.innerHTML='';return}const r=analyzeMail(ta.value);const sec=[];
    // Headline
    let head;
    if(r.isBounce){const b=r.hits[0];head=`<div class="verdict err"><div class="v-i">${ic('x')}</div><div><span>Unzustellbar</span><h4>${b.t}</h4><p>${b.why}</p></div></div>
      <div class="todo"><strong>Was tun?</strong><ol>${b.fix.map(f=>`<li>${f}</li>`).join('')}</ol>${b.dns?`<button class="btn sm" type="button" data-dnsgo="${b.dns}">${ic('globe')}Mail-Check für ${esc(b.dns==='rcpt'?domOf(r.rcpt)||'Empfängerdomain':r.fd||'Absenderdomain')}</button>`:''}</div>`}
    else if(r.isSpam){const reasons=[];if(r.auth.spf&&r.auth.spf!=='pass')reasons.push('SPF nicht bestanden');if(r.auth.dkim&&r.auth.dkim!=='pass')reasons.push('keine gültige DKIM-Signatur');if(r.auth.dmarc&&r.auth.dmarc!=='pass')reasons.push('DMARC nicht bestanden');
      r.tests.forEach(t=>{const m=SA_TESTS.find(([re])=>re.test(t));if(m&&/Sperrliste|Privatanschluss|Rückwärts|bekannte|Spam-Datenbanken|stark/.test(m[1]))reasons.push(m[1].replace(/\.$/,''))});
      head=`<div class="verdict warn"><div class="v-i">${ic('alert')}</div><div><span>Als Spam eingestuft</span><h4>Der Empfangsserver hat die Mail als Spam bewertet</h4><p>${reasons.length?'Hauptgründe: '+[...new Set(reasons)].map(esc).join(', ')+'.':'Details stehen in der Spam-Bewertung unten.'}</p></div></div>
      ${r.fd?`<div class="todo"><strong>Was tun?</strong><ol><li>Absenderdomain auf SPF, DKIM und DMARC prüfen.</li><li>Prüfen, ob die sendende IP auf einer Sperrliste steht.</li><li>Betreff ohne Großbuchstaben und Reizwörter, Text nicht nur als Bild.</li></ol><button class="btn sm" type="button" data-dnsgo="from">${ic('globe')}Mail-Check für ${esc(r.fd)}</button></div>`:''}`}
    else if(r.hits.length&&!r.H.some(h=>h.k==='received')){const b=r.hits[0];head=`<div class="verdict warn"><div class="v-i">${ic('alert')}</div><div><span>Mögliche Ursache</span><h4>${b.t}</h4><p>${b.why}</p></div></div><div class="todo"><strong>Was tun?</strong><ol>${b.fix.map(f=>`<li>${f}</li>`).join('')}</ol></div>`}
    else if(r.H.length)head=`<div class="verdict ok"><div class="v-i">${ic('check')}</div><div><span>Kopfzeilen ausgewertet</span><h4>Keine eindeutige Ablehnung oder Spam-Markierung gefunden</h4><p>Die Details unten zeigen Prüfergebnisse und den Weg der Mail.</p></div></div>`;
    else head=chk('info','Nichts erkannt','Füge die vollständige Fehlermeldung oder die Kopfzeilen ein. Sie beginnen meist mit „Received:“, „Return-Path:“ oder „Delivered-To:“.');
    sec.push(head);
    if(r.hits.length>1&&r.isBounce)sec.push(`<div class="sub"><h5>Weitere mögliche Ursachen</h5>${r.hits.slice(1,4).map(b=>chk('info',b.t,b.why)).join('')}</div>`);
    if(r.codes.length||r.replyLines.length)sec.push(`<div class="sub"><h5>Antwort des Servers</h5>${r.replyLines.length?`<pre class="srv">${esc(r.replyLines.join('\n'))}</pre>`:''}${r.codes.map(c=>{const [a,b]=c.split('.');const ref=REF.smtp.find(x=>x[0]===c);return `<div class="code-ex"><span class="mono c${a}">${c}</span><span>${ENH_CLASS[a]||''}, Bereich ${ENH_SUBJ[b]||b}${ref?`. <b>${esc(ref[1])}</b>${ref[2]?': '+esc(ref[2]):''}`:''}</span></div>`}).join('')}</div>`);
    if(r.dsn.length)sec.push(`<div class="sub"><h5>Zustellbericht</h5><dl class="kv">${r.dsn.map(([k,v])=>`<dt>${{'final-recipient':'Empfänger','action':'Aktion','status':'Status','remote-mta':'Empfangsserver','reporting-mta':'Meldender Server','diagnostic-code':'Fehlertext'}[k]}</dt><dd style="text-align:left;justify-content:flex-start">${esc(v)}</dd>`).join('')}</dl></div>`);
    if(Object.keys(r.auth).length)sec.push(`<div class="sub"><h5>Echtheitsprüfung</h5><div class="chks">${Object.entries(r.auth).map(([k,v])=>{const x=AUTHX[v]||['info',v];return chk(x[0],`${k.toUpperCase()}: ${x[1]}`,AUTHD[k])}).join('')}</div></div>`);
    if(r.spam.length||r.tests.length)sec.push(`<div class="sub"><h5>Spam-Bewertung</h5>${r.spam.map(s=>`<div class="spam-l">${s}</div>`).join('')}${r.tests.length?`<div class="tests">${r.tests.map(t=>{const m=SA_TESTS.find(([re])=>re.test(t));return `<div><span class="mono">${esc(t)}</span><span>${m?m[1]:'<span class="muted">ohne Erklärung</span>'}</span></div>`}).join('')}</div>`:''}</div>`);
    if(r.snd.length)sec.push(`<div class="sub"><h5>Absender</h5><div class="chks">${r.snd.map(([s,t,b])=>chk(s,t,b)).join('')}</div></div>`);
    if(r.hops.length){let prev=null;sec.push(`<div class="sub"><h5>Weg der Mail <small>${r.hops.length} Station${r.hops.length>1?'en':''}, älteste zuerst</small></h5><ol class="hops">${r.hops.map((h,i)=>{const d=prev&&!isNaN(h.date)&&!isNaN(prev)?(h.date-prev)/1000:null;prev=h.date;
      return `<li${d!=null&&d>300?' class="slow"':''}><div><b>${esc(h.by||'?')}</b><span>von ${esc(h.from||'?')}${h.ip?` <span class="mono">[${esc(h.ip)}]</span>`:''}</span></div><em>${isNaN(h.date)?'':new Date(h.date).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}${d!=null?`<br>${d<0?'Uhrzeit ungenau':'+'+fmtTime(d)}${d>300?' Verzögerung':''}`:''}</em></li>`}).join('')}</ol>
      ${r.hops.some((h,i)=>i&&!isNaN(h.date)&&!isNaN(r.hops[i-1].date)&&h.date-r.hops[i-1].date>300000)?'<p class="note">Eine Verzögerung von mehreren Minuten zwischen zwei Stationen deutet oft auf Greylisting oder eine Warteschlange beim Server hin.</p>':''}</div>`)}
    out.innerHTML=sec.join('');
    out.querySelectorAll('[data-dnsgo]').forEach(b=>{if(!ctx.hasTool('dns')){b.remove();return}b.onclick=()=>{const d=b.dataset.dnsgo==='rcpt'?domOf(r.rcpt):r.fd;if(!d)return;ctx.openTool('dns',{mode:'mail',domain:d,auto:true})}});
  };
  let tm;ta.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(run,300)});$('#mlGo',p).onclick=run;
  $('#mlB1',p).onclick=()=>{ta.value=SAMPLE_BOUNCE;run()};$('#mlB2',p).onclick=()=>{ta.value=SAMPLE_SPAM;run()};$('#mlClr',p).onclick=()=>{ta.value='';run();ta.focus()};
  $('#mlEml',p).onclick=async()=>{const f=await ctx.files.openText('E-Mail-Datei öffnen','*.eml;*.txt');if(f){ta.value=f.content;run();ctx.toast(f.name+' geladen')}};
  // .eml per Drag & Drop: Inhalt lesen statt die Datei im Fenster zu öffnen
  ta.addEventListener('dragover',e=>{e.preventDefault()});
  ta.addEventListener('drop',async e=>{e.preventDefault();const f=e.dataTransfer?.files?.[0];if(!f)return;if(f.size>10*1024*1024){ctx.toast('Datei größer als 10 MB');return}ta.value=await f.text();run()});
  run();
  },
};
