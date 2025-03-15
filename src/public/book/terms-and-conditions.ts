import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { sheet } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('funkhaus-sports-terms-and-conditions')
export class FunkhausSportsTermsAndConditions extends $LitElement() {
	render() {
		return html`
			<div class="p-8">
				<h1 class="font-bold text-xl mb-4">Geschäftsbedingungen für Ticketkäufer</h1>
				<h2 class="font-semibold text-lg">1. Definitionen</h2>
				<p>In diesen allgemeinen Ticketbedingungen gelten die folgenden Definitionen:</p>
				<dl class="mb-4">
					<dt class="font-semibold">1.1. Allgemeine Ticket-Bedingungen</dt>
					<dd>Die allgemeinen Geschäftsbedingungen, die in diesem Dokument enthalten sind.</dd>
					<dt class="font-semibold">1.2. Funkhaus Berlin Events GmbH</dt>
					<dd>
						Das Unternehmen, nachstehend Ticketprovider genannt, das dem Nutzer seinen Kartenverkaufsdienst anbietet,
						mit Sitz in Nalepastraße 18, 12459 Berlin, eingetragen beim Amtsgericht Berlin (Charlottenburg) unter der
						Registernummer HRB174489B.
					</dd>
					<dt class="font-semibold">1.3. Dienstleistungen</dt>
					<dd>Alle von Ticketprovider dem Nutzer über die Plattform angebotenen Dienstleistungen.</dd>
					<dt class="font-semibold">1.4. Veranstalter</dt>
					<dd>
						Der Veranstalter, der in Ausübung eines Berufes oder Gewerbes für die Organisation von Veranstaltungen
						handelt und die Plattform von Ticketprovider für den Verkauf von (e)Ticket(s) nutzt.
					</dd>
					<dt class="font-semibold">1.5. Plattform</dt>
					<dd>
						Die von Ticketprovider im Rahmen des Vertrags entwickelte und dem Veranstalter und dem Nutzer zur Verfügung
						gestellte SaaS-Anwendung, mit der der Nutzer bei Ticketprovider - als Vermittler des Veranstalters -
						(e)Tickets für vom Veranstalter organisierte Veranstaltungen erwerben kann.
					</dd>
					<dt class="font-semibold">1.6. Vertrag</dt>
					<dd>Der zwischen dem Veranstalter und Ticketprovider geschlossene Vertrag über die Nutzung der Plattform.</dd>
					<dt class="font-semibold">1.7. (e)Ticket(s)</dt>
					<dd>
						Die Eintrittskarte für eine Veranstaltung, die vom oder im Namen des Veranstalters organisiert und von
						Ticketprovider über die Plattform an den Nutzer verkauft wird.
					</dd>
					<dt class="font-semibold">1.8. Nutzer</dt>
					<dd>
						Die natürliche und/oder juristische Person, die einen Vertrag mit Ticketprovider abschließt oder abschließen
						möchte und durch die Nutzung der Plattform (e)Ticket(s) von Ticketprovider für eine vom oder im Namen des
						Veranstalters organisierte Veranstaltung gemäß diesen Allgemeinen Ticketbedingungen erwirbt.
					</dd>
				</dl>

				<h2 class="font-semibold text-lg">2. Anwendbarkeit dieser Allgemeinen Ticketbedingungen</h2>
				<p>
					2.1. Diese Allgemeinen Ticketbedingungen gelten für den Vertrag zwischen Ticketprovider und dem Nutzer und für
					die Erbringung der Leistungen an den Nutzer.
				</p>
				<p>
					2.2. Diese Allgemeinen Ticketbedingungen gelten auch zugunsten jeder von Ticketprovider beschäftigten Person,
					jeder von Ticketprovider beauftragten Person und jeder Person, für deren Handlungen oder Unterlassungen
					Ticketprovider haftet oder haften kann.
				</p>
				<p>
					2.3. Sollte eine Bestimmung dieser Allgemeinen Ticketbedingungen nichtig oder anderweitig nicht durchsetzbar
					sein, so berührt dies nicht die Gültigkeit der übrigen Bestimmungen dieser Allgemeinen Ticketbedingungen
					und/oder des Vertrags zwischen Ticketprovider und dem Nutzer, und Ticketprovider und der Nutzer werden
					Konsultationen aufnehmen, um eine neue Bestimmung zu vereinbaren, die die nichtige/zerstörte oder nicht
					durchsetzbare Bestimmung ersetzt, wobei die Parteien den Zweck und die Absicht der nichtigen/zerstörten oder
					nicht durchsetzbaren Bestimmung so weit wie möglich beachten werden.
				</p>
				<p>
					2.4. Die Anwendbarkeit anderer allgemeiner Geschäftsbedingungen, sei es durch den Nutzer oder durch einen
					Dritten, wird ausdrücklich abgelehnt.
				</p>
				<p>
					2.5. Ticketprovider ist berechtigt, diese Allgemeinen Ticketbedingungen einseitig zu ändern. Im Falle von
					Änderungen der Allgemeinen Ticketbedingungen wird Ticketprovider den Nutzer hierüber schriftlich informieren.
					Der Veranstalter erklärt sich mit diesen Änderungen im Voraus einverstanden, so dass die geänderten
					Allgemeinen Ticketbedingungen von Rechts wegen für alle von Ticketprovider nach Bekanntgabe der geänderten
					Allgemeinen Ticketbedingungen erbrachten Leistungen gelten.
				</p>

				<h2 class="font-semibold text-lg">3. Ticketprovider Dienstleistungen</h2>
				<p>
					3.1. Die von Ticketprovider dem Nutzer angebotenen Dienstleistungen bestehen darin, dem Nutzer Zugang zur
					Nutzung der Plattform für den Kauf von (e)Tickets zu verschaffen, wobei für jeden einzelnen Kauf von
					(e)Tickets ein direkter und einmaliger Vertrag zwischen Ticketprovider und dem Nutzer zustande kommt. Wenn ein
					Nutzer über die Plattform ein (e)Ticket für eine vom Veranstalter organisierte Veranstaltung erwirbt, kommt
					ein Fernabsatzvertrag zwischen dem Nutzer und Ticketprovider über die Nutzung der Plattform zustande.
				</p>
				<p>
					3.2. In dem Moment, in dem der Nutzer ein (e)Ticket für eine Veranstaltung des Veranstalters über die
					Plattform erwirbt, kommt ein Kaufvertrag über das (die) (e)Ticket(s) (und/oder die Reservierung) zwischen dem
					Nutzer und dem Veranstalter zustande, wobei der Veranstalter als Verkäufer und der Nutzer als Käufer auftritt.
					Das Zustandekommen dieses Kaufvertrages erfolgt durch die Vermittlung der Plattform. Ticketprovider ist
					ausdrücklich nicht Partei des Kaufvertrages zwischen Veranstalter und Nutzer. Die Leistungen von
					Ticketprovider bestehen (nur) im Anbieten der Leistungen über die Plattform. Ticketprovider haftet niemals für
					die vom Veranstalter organisierte Veranstaltung oder damit zusammenhängende Angelegenheiten. Die
					Unternehmensdaten des Veranstalters werden über die Plattform zur Verfügung gestellt.
				</p>
				<p>
					3.3. Die Bezahlung des (e)Tickets durch den Nutzer erfolgt über die Plattform. Nach der Zahlung erhält der
					Nutzer das (e)Ticket (einen Hyperlink) per E-Mail. Zahlungen, die Ticketprovider vom Nutzer erhält, werden von
					Ticketprovider an den Veranstalter weitergeleitet, wobei eine zwischen Ticketprovider und dem Veranstalter
					vereinbarte Gebühr einbehalten wird und weitere zwischen ihnen vereinbarte Bedingungen gelten.
				</p>
				<p>
					3.4. Das (e)Ticket ist eine Eintrittskarte zu einer Veranstaltung, die vom Veranstalter organisiert und dem
					Nutzer von Ticketprovider über die Plattform angeboten wird.
				</p>
				<p>
					3.5. Der Verkaufspreis für das (e)Ticket(s) wird dem Nutzer auf der Plattform bekannt gegeben. Mit dem Kauf
					des (e)Tickets schuldet der Nutzer Ticketprovider die Höhe des Verkaufspreises zuzüglich etwaiger
					Servicekosten und Buchungskosten pro (e)Ticket. Der Nutzer kann das/die (e)Ticket(s) online über die auf der
					Plattform angebotenen Zahlungsmöglichkeiten bezahlen. Wenn für eine vom Nutzer gewählte Zahlungsmethode
					zusätzliche Transaktionskosten anfallen, wird dies auf der Plattform angegeben. Der Veranstalter kann die
					Preise für (e)Ticket(s) jederzeit anpassen. Ticketprovider haftet gegenüber dem Nutzer unter keinen Umständen
					für zwischenzeitliche Preisänderungen durch den Veranstalter sowie für Rechtschreib- und/oder Tippfehler in
					Bezug auf die auf der Plattform angegebenen Preise. Der Nutzer kann Ticketprovider nicht für Preise haftbar
					machen, bei denen der Nutzer vernünftigerweise hätte erwarten müssen, dass es sich bei dem Angebot und/oder
					dem Preis um einen offensichtlichen oder handwerklichen Fehler handelt.
				</p>
				<p>
					3.6. Der Nutzer ist selbst dafür verantwortlich, sich über die Veranstaltung zu informieren, für die er (e)
					Tickets erworben hat. Ticketprovider haftet nicht für Änderungen, Verschiebungen oder Absagen von
					Veranstaltungen des Veranstalters. Im Falle von Änderungen muss der Benutzer eine eventuelle Entschädigung vom
					Veranstalter zurückfordern.
				</p>
				<p>
					3.7. Mit dem Kauf des/der (e)Tickets kommt ein endgültiger Fernabsatzvertrag zwischen dem Nutzer und
					Ticketprovider und ein Kaufvertrag zwischen dem Nutzer und dem Veranstalter zustande. Aufgrund der Natur der
					Dienstleistung ist es nicht möglich, den Fernkauf des (e)Tickets aufzulösen. Der Kaufvertrag ist
					unwiderruflich. Das Rücktrittsrecht Bürgerlichen Gesetzbuches ausdrücklich nicht anwendbar. Durch die Annahme
					dieser Allgemeinen Ticketbedingungen erklärt sich der Verbraucher im Voraus ausdrücklich damit einverstanden,
					dass der digitale Inhalt des (e)Tickets bzw. der (e)Tickets sofort zur Verfügung gestellt wird und dass der
					Nutzer auf sein Rücktrittsrecht verzichtet.
				</p>

				<h2 class="font-semibold text-lg">4. Die Plattform</h2>
				<p>
					4.1. Ticketprovider gewährt dem Veranstalter und den Nutzern einen Fernzugriff auf die Plattform und die
					Dienstleistungen über das Internet oder ein anderes ähnliches und anwendbares Netz. Beim Kauf eines (e)Tickets
					wird Ticketprovider den Nutzer auffordern, die folgenden personenbezogenen Daten einzugeben: Vornamen;
					Nachname; E-Mail; Diese Daten sind erforderlich, um dem Nutzer das (die) Ticket(s) zur Verfügung zu stellen.
					Zusätzlich zu den oben genannten Daten kann der Veranstalter den Nutzer auffordern, über die Plattform weitere
					personenbezogene Daten wie Vor- und Nachname, Wohnort, E-Mail-Adresse, Geschlecht und Geburtsdatum anzugeben.
				</p>
				<p>
					4.2. Beim Kauf mehrerer (e)Tickets kann der Veranstalter den Nutzer auffordern, über die Plattform jedes
					gekaufte (e)Ticket zu personalisieren, indem er persönliche Daten der Besucher, die nicht der Nutzer sind, wie
					Vor- und Nachname, Wohnort, E-Mail-Adresse, Geschlecht und Geburtsdatum eingibt.
				</p>
				<p>
					4.3. Der Nutzer muss mindestens die folgenden Anforderungen erfüllen: a Der Benutzer muss per E-Mail
					erreichbar sein.
				</p>
				<p>
					4.4. Der Nutzer ist für die Richtigkeit, Vollständigkeit und Genauigkeit aller an Ticketprovider übermittelten
					Informationen und Daten, auch von Dritten, verantwortlich und sichert zu, dass sich diese rechtmäßig in seinem
					Besitz befinden. Ticketprovider haftet nicht für die verspätete oder unklare Übermittlung von Informationen
					oder offensichtliche Schreibfehler, unabhängig davon, wen die Informationen betreffen oder wem sie zur
					Verfügung gestellt werden.
				</p>
				<p>
					4.5. Ticketprovider ist unter allen Umständen und zu jeder Zeit berechtigt, einen Kauf eines (E-)Tickets über
					die Plattform nicht zu bearbeiten oder unter anderen Bedingungen abzurechnen. Ticketprovider ist berechtigt,
					(zusätzliche) technische Maßnahmen zu ergreifen, um eine unrechtmäßige Nutzung oder eine Nutzung zu anderen
					als den vereinbarten Zwecken zu verhindern. Ticketprovider ist auch berechtigt, im Zusammenhang mit der
					Nutzung der Services und der Plattform Maßnahmen zu ergreifen, die eine Haftung gegenüber Dritten verhindern
					oder beschränken. Bei (drohenden) Verstößen gegen diese Allgemeinen Ticketbedingungen ist Ticketprovider
					berechtigt, den Zugang des Veranstalters und der Nutzer zu den Services und/oder der Plattform zu verweigern,
					zu beschränken oder auszusetzen.
				</p>
				<p>
					4.6. Mit dem Kauf von (e)Tickets erklärt sich der Nutzer damit einverstanden, in Übereinstimmung mit diesen
					Allgemeinen Ticketbedingungen zu handeln.
				</p>
				<p>
					4.7. Ticketprovider kann alle Maßnahmen ergreifen, die es für erforderlich hält, einschließlich, aber nicht
					beschränkt auf die Sperrung des Verkaufs und/oder Kaufs von (e)Tickets auf der Plattform und/oder die
					(vorübergehende) Sperrung oder Einschränkung der Nutzung der Plattform. Insbesondere kann der Zugang zur
					Plattform in Abhängigkeit von der Geschäftshistorie des Nutzers und seinem Verhalten auf der Plattform nach
					dem Ermessen von Ticketprovider verweigert oder eingeschränkt werden.
				</p>
				<p>
					4.8. Ticketprovider ist berechtigt, die Plattform ohne Vorankündigung und ohne Angabe von Gründen außer
					Betrieb zu setzen oder die Nutzung einzuschränken, ohne dass sich daraus ein Anspruch auf Schadensersatz
					gegenüber dem Nutzer ergibt.
				</p>

				<h2 class="font-semibold text-lg">5. Erstattung</h2>
				<p>
					5.1. Ticketprovider kann auf Anordnung des Veranstalters eine Rückerstattung an den Nutzer vornehmen. Der
					Grund für eine Rückerstattung spielt dabei keine Rolle.
				</p>
				<p>
					5.2. Im Falle einer Rückerstattung erhält der Nutzer immer den Betrag des (e)Tickets zurück, vorbehaltlich des
					Abzugs der vom Nutzer gezahlten Servicekosten, Buchungskosten und/oder Transaktionskosten (und der zwischen
					Ticketprovider und dem Veranstalter vereinbarten Gebühr).
				</p>
				<p>
					5.3. Ticketprovider wird niemals eine Rückerstattung ohne die Zusammenarbeit und Anweisung des Veranstalters
					vornehmen.
				</p>

				<h2 class="font-semibold text-lg">6. Gewährleistung und Verfügbarkeit</h2>
				<p>
					6.1. Ticketprovider ist verantwortlich für die Erbringung der Dienstleistungen und/oder der Plattform in
					Übereinstimmung mit diesen Allgemeinen Ticketbedingungen. Ticketprovider unternimmt vertretbare
					wirtschaftliche Anstrengungen, um branchenübliche Standards einzuhalten. Ticketprovider garantiert nicht die
					ununterbrochene Verfügbarkeit des Dienstes und/oder der Plattform, und der Nutzer akzeptiert, dass der Dienst
					und die Plattform nur die Funktionen und Merkmale zum Zeitpunkt der Nutzung durch den Nutzer aufweisen.
				</p>
				<p>
					6.2. Ticketprovider kann den Service und/oder die Plattform oder Teile davon zum Zwecke der (geplanten und
					ungeplanten) Wartung, Änderung oder Verbesserung vorübergehend außer Betrieb setzen. Ticketprovider kann von
					Zeit zu Zeit die Funktionalitäten des Dienstes und/oder der Plattform anpassen.
				</p>
				<p>
					6.3. Der Nutzer erkennt ausdrücklich an und erklärt sich damit einverstanden, dass die Nutzung der Plattform
					auf sein eigenes Risiko erfolgt. Soweit nach deutschem Recht zulässig, wird die Plattform "wie besehen", mit
					etwaigen Mängeln und ohne jegliche Garantie bereitgestellt.
				</p>
				<p>
					6.4. Der Nutzer stellt Ticketprovider von allen Schäden und Ansprüchen Dritter frei, die sich aus der
					Behauptung ergeben oder damit zusammenhängen, dass eine Tätigkeit des Nutzers rechtswidrig ist oder gegen
					diese Allgemeinen Ticketbedingungen und/oder den Vertrag verstößt.
				</p>

				<h2 class="font-semibold text-lg">7. Verarbeitung personenbezogener Daten</h2>
				<p>
					7.1. Bei der Verarbeitung der personenbezogenen Daten der Nutzer zum Zwecke des Verkaufs von (E-)Tickets nimmt
					der Veranstalter die Rolle des Auftragsverarbeiters ein. Ticketprovider verarbeitet die personenbezogenen
					Daten in diesem Zusammenhang in der Rolle des Auftragsverarbeiters und nur auf Anweisung des Veranstalters.
					Wir empfehlen, die Datenschutzerklärung des Veranstalters zu konsultieren, um weitere Informationen über diese
					Verarbeitung zu erhalten.
				</p>
				<p>
					7.2. Ticketprovider kann personenbezogene Daten auch für eigene Zwecke in der Rolle des für die
					Datenverarbeitung Verantwortlichen verarbeiten, zum Beispiel um die Nutzung der Plattform zu analysieren.
					Weitere Informationen über die Verarbeitung personenbezogener Daten in diesem Zusammenhang finden Sie in
					unserer Datenschutz- und Cookie-Erklärung, die Sie hier abrufen können.
				</p>

				<h2 class="font-semibold text-lg">8. Geistiges Eigentum und Nutzungsrechte</h2>
				<p>
					8.1. Im Rahmen dieser Allgemeinen Ticketbedingungen gewährt Ticketprovider dem Nutzer eine widerrufliche,
					nicht ausschließliche, nicht übertragbare, beschränkte Lizenz zur Nutzung der Plattform.
				</p>
				<p>
					8.2. Die Nutzung der Plattform ist streng persönlich und der Nutzer darf die Plattform nicht ohne vorherige
					schriftliche Zustimmung von Ticketprovider an Dritte weitergeben. Der Nutzer darf die Plattform nicht in
					irgendeiner Weise missbrauchen. Die Informationen, die der Nutzer auf der Plattform bereitstellt, verstoßen
					nicht gegen Gesetze oder Vorschriften. Der Nutzer wird keine falschen Verbindungen zu anderen natürlichen
					Personen angeben. Dem Veranstalter ist es unter anderem untersagt: Bedrohung oder Belästigung anderer Nutzer;
					Umgehung von geografischen oder anderen technischen Beschränkungen, die Ticketprovider dem Service oder der
					Plattform auferlegt hat; Entfernen oder Ändern von Eigentumsrechten, Marken oder anderen Logos, die an den
					Diensten angebracht oder in diesen enthalten sind; Die Nutzung der Plattform oder der Dienstleistungen für
					kommerzielle Zwecke oder andere Zwecke, die nicht ausdrücklich von Ticketprovider genehmigt wurden;
					Behinderung oder Einschränkung des Zugangs oder der Nutzung der Plattform oder der Dienste durch andere
					Nutzer; Dienstleistungen, außer in dem Umfang, in dem solche Handlungen nach geltendem Recht nicht
					ausgeschlossen werden können, ohne unsere ausdrückliche vorherige schriftliche Zustimmung; die Sicherheit der
					Plattform oder der Dienste nicht absichtlich zu testen, ohne die ausdrückliche vorherige schriftliche
					Zustimmung von Ticketprovider.
				</p>
				<p>
					8.3. Ticketprovider behält sich das Recht vor, die Plattform oder jeden anderen Dienst zu Wartungszwecken
					vorübergehend oder dauerhaft zu ändern, auszusetzen oder einzustellen, ohne dass Ticketprovider dem Nutzer
					gegenüber haftbar ist.
				</p>
				<p>
					8.4. Alle Rechte an geistigem Eigentum in Bezug auf die Plattform, einschließlich, aber nicht beschränkt auf
					die Quellcodes, Websites, Portaldateien, Marken, Designs und Urheberrechte in Bezug auf die grafische
					Benutzeroberfläche, liegen ausschließlich bei Ticketprovider. Sofern nicht ausdrücklich in diesen Allgemeinen
					Ticketbedingungen angegeben, werden keine anderen Rechte oder Lizenzen in Bezug auf Rechte an geistigem
					Eigentum gewährt oder impliziert.
				</p>
				<p>
					8.5. Ticketprovider hat technische Maßnahmen zum Schutz der Plattform getroffen. Dem Nutzer ist es nicht
					gestattet, solche technischen Maßnahmen zu entfernen oder zu umgehen oder entfernen oder umgehen zu lassen.
					Sollte es zu einer Entfernung oder Umgehung technischer Maßnahmen gekommen sein, so hat dies eine sofortige
					Sperrung der Nutzung der Plattform zur Folge, unbeschadet des Rechts von Ticketprovider, vollen Schadensersatz
					zu verlangen.
				</p>

				<h2 class="font-semibold text-lg">9. Haftung</h2>
				<p>
					9.1. Außer im Falle von Vorsatz oder grober Fahrlässigkeit seitens Ticketprovider haftet Ticketprovider
					gegenüber dem Nutzer nicht für Schäden, die dem Nutzer durch die Nutzung der Plattform, die Erfüllung des
					Kaufvertrags zwischen dem Nutzer und dem Veranstalter, eine stillschweigende Garantie, die Verarbeitung
					personenbezogener Daten, die Verletzung einer Verpflichtung des Veranstalters als für die Verarbeitung
					Verantwortlicher (verursacht durch Fahrlässigkeit von Ticketprovider, seinen Mitarbeitern oder Vertretern oder
					anderweitig) und/oder den Missbrauch der Plattform entstehen.
				</p>
				<p>
					9.2. Ticketprovider haftet nicht für indirekte Schäden des Nutzers, einschließlich, aber nicht beschränkt auf
					entgangenen Gewinn, Verlust des Firmenwerts, Verlust von Beziehungen aufgrund von Verzögerungen, Verlust von
					Daten, entgangene Einsparungen, Schäden aufgrund von Geschäftsstagnation, Schäden, die durch Vorsatz oder
					bewusste Fahrlässigkeit von Hilfspersonen verursacht wurden, usw., wie auch immer genannt und von wem auch
					immer erlitten.
				</p>
				<p>
					9.3. In den Fällen, in denen Ticketprovider trotz der Bestimmungen dieser Allgemeinen Ticketbedingungen
					gegenüber dem Nutzer für Schäden oder Verluste haftet, darf die Gesamthaftung von Ticketprovider gemäß diesen
					Allgemeinen Ticketbedingungen 500 EUR (fünfhundert Euro) nicht übersteigen.
				</p>

				<h2 class="font-semibold text-lg">10. Laufzeit und Beendigung</h2>
				<p>
					10.1. Der Vertrag wird auf unbestimmte Zeit geschlossen. Der Vertrag kann von jeder Partei jederzeit
					schriftlich gekündigt werden.
				</p>
				<p>
					10.2. Ticketprovider hat das Recht, den Vertrag mit sofortiger Wirkung zu kündigen, ohne dass es einer
					weiteren Inverzugsetzung bedarf und ohne dass Ticketprovider dem Nutzer gegenüber schadensersatzpflichtig
					wird, wenn der Nutzer gegen die Bestimmungen des Vertrages und/oder dieser Allgemeinen Ticketbedingungen
					verstößt.
				</p>
				<p>
					10.3. Jede der Parteien ist berechtigt, den Vertrag mit sofortiger Wirkung aufzulösen, wenn die andere Partei
					den Vertrag nicht ordnungsgemäß erfüllt, nachdem sie schriftlich in Verzug gesetzt wurde und eine angemessene
					Frist zur ordnungsgemäßen Erfüllung des Vertrags gesetzt wurde.
				</p>
				<p>
					10.4. Hat der Nutzer bei Beendigung des Vertrages bereits eine Leistung in Ausführung des Vertrages erhalten,
					so wird diese Leistung und die damit verbundene Zahlungspflicht nicht rückgängig gemacht. Beträge, die
					Ticketprovider dem Nutzer vor der Auflösung in Rechnung gestellt hat, bleiben Ticketprovider in voller Höhe
					geschuldet und werden mit der Kündigung sofort fällig.
				</p>
				<p>
					10.5. Bei Beendigung des Vertrages ist Ticketprovider berechtigt, dem Nutzer sofort den Zugang zu den Services
					und/oder der Plattform zu verweigern, und Ticketprovider wird alle gespeicherten Daten, einschließlich aller
					(e)Tickets, löschen oder unzugänglich machen. In einem solchen Fall ist Ticketprovider nicht verpflichtet, dem
					Nutzer eine Kopie des (e)Tickets zur Verfügung zu stellen.
				</p>

				<h2 class="font-semibold text-lg">11. Anwendbares Recht und Streitigkeiten</h2>
				<p>11.1. Für diese Allgemeinen Ticketbedingungen gilt ausschließlich deutsches Recht.</p>
				<p>
					11.2. Für alle Streitigkeiten, die sich aus oder im Zusammenhang mit dem Vertrag und/oder diesen Allgemeinen
					Ticketbedingungen ergeben, ist ausschließlich das zuständige Gericht in 's-Hertogenbosch zuständig.
				</p>

				<h2 class="font-semibold text-lg">12. Kontaktangaben</h2>
				<p>
					12.1. Wenn der Nutzer Fragen zu diesen Allgemeinen Ticketbedingungen hat, kann er sich schriftlich oder per
					Email an Ticketprovider wenden: Funkhaus Berlin Events GmbH, Nalepastrassse 18, 12459 Berlin, Deutschland,
					E-Mail: ticket@funkhaus-berlin.net.
				</p>
			</div>

			<schmancy-flex class="sticky bottom-4" justify="center">
				<schmancy-button
					variant="filled"
					@click=${() => {
						sheet.dismiss(this.tagName)
					}}
					>Dismiss</schmancy-button
				>
			</schmancy-flex>
		`
	}
}
