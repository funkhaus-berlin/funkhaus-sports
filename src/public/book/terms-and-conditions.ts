import { $LitElement } from '@mhmo91/schmancy/dist/mixins'
import { sheet } from '@mhmo91/schmancy'
import { html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('funkhaus-sports-terms-and-conditions')
export class FunkhausSportsTermsAndConditions extends $LitElement() {
	render() {
		return html`
			<div class="p-8">
				<h1 class="font-bold text-xl mb-4">Geschäftsbedingungen für Buchungskunden</h1>
				<h2 class="font-semibold text-lg">1. Definitionen</h2>
				<p>In diesen allgemeinen Buchungsbedingungen gelten die folgenden Definitionen:</p>
				<dl class="mb-4">
					<dt class="font-semibold">1.1. Allgemeine Buchungsbedingungen</dt>
					<dd>Die allgemeinen Geschäftsbedingungen, die in diesem Dokument enthalten sind.</dd>
					<dt class="font-semibold">1.2. Funkhaus Sports GmbH</dt>
					<dd>
						Das Unternehmen, nachstehend Buchungsanbieter genannt, das dem Nutzer seinen Buchungsdienst für sportliche
						Aktivitäten anbietet, mit Sitz in [Adresse einfügen], eingetragen beim Amtsgericht [Ort] unter der
						Registernummer [Registernummer einfügen].
					</dd>
					<dt class="font-semibold">1.3. Dienstleistungen</dt>
					<dd>
						Alle von Buchungsanbieter dem Nutzer über die Plattform angebotenen Dienstleistungen im Bereich Sport,
						Freizeit, Kurse, Anlagen und sonstiger sportbezogener Angebote.
					</dd>
					<dt class="font-semibold">1.4. Veranstalter</dt>
					<dd>
						Der Veranstalter, der im Rahmen eines Gewerbes oder einer beruflichen Tätigkeit sportliche Angebote oder
						Einrichtungen organisiert und die Plattform von Buchungsanbieter für die Buchung dieser Dienstleistungen
						nutzt.
					</dd>
					<dt class="font-semibold">1.5. Plattform</dt>
					<dd>
						Die von Buchungsanbieter entwickelte und dem Veranstalter sowie dem Nutzer zur Verfügung gestellte
						SaaS-Anwendung, über die der Nutzer sportliche Dienstleistungen, Kurse, Anlagen oder sonstige Angebote
						buchen kann.
					</dd>
					<dt class="font-semibold">1.6. Vertrag</dt>
					<dd>
						Der zwischen dem Veranstalter und Buchungsanbieter geschlossene Vertrag über die Nutzung der Plattform.
					</dd>
					<dt class="font-semibold">1.7. Buchungsbestätigung</dt>
					<dd>
						Die Bestätigung über die Buchung einer sportlichen Dienstleistung, eines Kurses oder der Nutzung einer
						Sportanlage, die dem Nutzer von Buchungsanbieter über die Plattform zugesandt wird.
					</dd>
					<dt class="font-semibold">1.8. Nutzer</dt>
					<dd>
						Die natürliche und/oder juristische Person, die einen Vertrag mit Buchungsanbieter abschließt oder
						abschließen möchte und durch die Nutzung der Plattform sportliche Dienstleistungen oder Angebote von einem
						Veranstalter in Anspruch nimmt.
					</dd>
				</dl>

				<h2 class="font-semibold text-lg">2. Anwendbarkeit dieser Allgemeinen Buchungsbedingungen</h2>
				<p>
					2.1. Diese Allgemeinen Buchungsbedingungen gelten für den Vertrag zwischen Buchungsanbieter und dem Nutzer
					sowie für die Erbringung der Leistungen an den Nutzer.
				</p>
				<p>
					2.2. Diese Bedingungen gelten auch zugunsten aller von Buchungsanbieter beschäftigten oder beauftragten
					Personen, für deren Handlungen oder Unterlassungen Buchungsanbieter haftet.
				</p>
				<p>
					2.3. Sollte eine Bestimmung dieser Bedingungen nichtig oder undurchführbar sein, so bleibt die Gültigkeit der
					übrigen Bestimmungen unberührt. Buchungsanbieter und der Nutzer verpflichten sich, in einem solchen Fall in
					Verhandlungen zu treten, um eine neue Bestimmung zu vereinbaren, die dem wirtschaftlichen Zweck der
					unwirksamen Bestimmung möglichst nahekommt.
				</p>
				<p>
					2.4. Die Anwendung anderer allgemeiner Geschäftsbedingungen, sei es durch den Nutzer oder Dritte, wird
					ausdrücklich ausgeschlossen.
				</p>
				<p>
					2.5. Buchungsanbieter ist berechtigt, diese Bedingungen einseitig zu ändern. Über Änderungen wird der Nutzer
					schriftlich informiert. Mit Inanspruchnahme der Leistungen erklärt sich der Nutzer im Voraus mit den
					geänderten Bedingungen einverstanden.
				</p>

				<h2 class="font-semibold text-lg">3. Dienstleistungen von Buchungsanbieter</h2>
				<p>
					3.1. Buchungsanbieter bietet dem Nutzer über die Plattform die Möglichkeit, sportliche Dienstleistungen,
					Kurse, Anlagen und andere sportbezogene Angebote zu buchen. Für jede Buchung kommt ein direkter und einmaliger
					Vertrag zwischen Buchungsanbieter und dem Nutzer zustande. Soweit der Nutzer über die Plattform eine
					Buchungsbestätigung erhält, kommt ein Fernabsatzvertrag zwischen dem Nutzer und Buchungsanbieter zustande.
				</p>
				<p>
					3.2. Im Moment der Buchung einer sportlichen Dienstleistung kommt ein Vertrag zwischen dem Nutzer und dem
					Veranstalter zustande, wobei der Veranstalter als Anbieter und der Nutzer als Buchender auftritt.
					Buchungsanbieter ist ausschließlich Vermittler und nicht Partei des Vertrages.
				</p>
				<p>
					3.3. Die Bezahlung der gebuchten Dienstleistung erfolgt über die Plattform. Nach erfolgter Zahlung erhält der
					Nutzer eine Buchungsbestätigung per E-Mail. Zahlungen, die Buchungsanbieter vom Nutzer erhält, werden an den
					Veranstalter weitergeleitet, abzüglich einer zwischen den Parteien vereinbarten Gebühr.
				</p>
				<p>3.4. Die Buchungsbestätigung dient als Nachweis der erfolgten Buchung.</p>
				<p>
					3.5. Der Buchungspreis wird dem Nutzer auf der Plattform angezeigt. Mit Abschluss der Buchung verpflichtet
					sich der Nutzer, den angegebenen Preis zzgl. etwaiger Service-, Buchungs- und Transaktionskosten zu zahlen.
					Etwaige zusätzliche Kosten werden auf der Plattform ausgewiesen. Der Veranstalter behält sich das Recht vor,
					Preise jederzeit anzupassen. Buchungsanbieter haftet nicht für kurzfristige Preisänderungen oder
					Offensichtliche Fehler in der Preisangabe.
				</p>
				<p>
					3.6. Der Nutzer ist selbst dafür verantwortlich, sich vor der Buchung über die jeweilige sportliche
					Dienstleistung oder Anlage zu informieren. Buchungsanbieter haftet nicht für Änderungen, Verschiebungen oder
					Absagen von sportlichen Angeboten, die durch den Veranstalter vorgenommen werden.
				</p>
				<p>
					3.7. Mit Abschluss der Buchung kommt ein endgültiger Fernabsatzvertrag zwischen dem Nutzer und
					Buchungsanbieter sowie ein Buchungsvertrag zwischen dem Nutzer und dem Veranstalter zustande. Ein gesetzliches
					Widerrufsrecht ist – soweit nicht ausdrücklich etwas anderes vereinbart wurde – ausgeschlossen.
				</p>

				<h2 class="font-semibold text-lg">4. Die Plattform</h2>
				<p>
					4.1. Buchungsanbieter gewährt dem Nutzer und dem Veranstalter einen Fernzugriff auf die Plattform über das
					Internet oder ein vergleichbares Netzwerk. Bei der Buchung sportlicher Angebote wird der Nutzer aufgefordert,
					personenbezogene Daten (z. B. Vorname, Nachname, E-Mail-Adresse) anzugeben, die zur Erbringung der
					Dienstleistung erforderlich sind.
				</p>
				<p>
					4.2. Bei Buchung mehrerer Angebote kann der Veranstalter den Nutzer auffordern, jede Buchung individuell zu
					personalisieren, indem zusätzliche personenbezogene Daten angegeben werden.
				</p>
				<p>
					4.3. Der Nutzer muss mindestens per E-Mail erreichbar sein und die sonstigen auf der Plattform angegebenen
					Voraussetzungen erfüllen.
				</p>
				<p>
					4.4. Der Nutzer ist verantwortlich dafür, dass alle an Buchungsanbieter übermittelten Daten vollständig und
					korrekt sind. Buchungsanbieter übernimmt keine Haftung für Verzögerungen oder Fehler bei der
					Datenübermittlung.
				</p>
				<p>
					4.5. Buchungsanbieter behält sich das Recht vor, Buchungen nicht zu bearbeiten oder unter geänderten
					Bedingungen abzuwickeln, um eine unrechtmäßige Nutzung oder anderweitige Verstöße zu verhindern.
				</p>
				<p>
					4.6. Mit Abschluss der Buchung erklärt sich der Nutzer einverstanden, die Plattform in Übereinstimmung mit
					diesen Bedingungen zu nutzen.
				</p>
				<p>
					4.7. Buchungsanbieter behält sich technische Maßnahmen vor, um Missbrauch der Plattform zu verhindern. Bei
					Verstößen kann der Zugang zur Plattform eingeschränkt oder gesperrt werden.
				</p>
				<p>
					4.8. Buchungsanbieter ist berechtigt, die Plattform ohne Vorankündigung oder Angabe von Gründen vorübergehend
					außer Betrieb zu nehmen. In einem solchen Fall besteht kein Anspruch des Nutzers auf Schadensersatz.
				</p>

				<h2 class="font-semibold text-lg">5. Erstattung und Stornierung</h2>
				<p>
					5.1. Eine Erstattung erfolgt ausschließlich auf Anweisung des Veranstalters, wobei der Grund hierfür
					unerheblich ist.
				</p>
				<p>
					5.2. Im Falle einer Erstattung erhält der Nutzer den gezahlten Betrag abzüglich etwaiger anfallender Service-,
					Buchungs- und Transaktionskosten.
				</p>
				<p>5.3. Buchungsanbieter führt Erstattungen nur in Abstimmung mit dem Veranstalter durch.</p>
				<p>
					5.4. Etwaige Stornierungsbedingungen werden vom Veranstalter festgelegt und dem Nutzer vor Abschluss der
					Buchung auf der Plattform mitgeteilt.
				</p>

				<h2 class="font-semibold text-lg">6. Gewährleistung und Verfügbarkeit</h2>
				<p>
					6.1. Buchungsanbieter sorgt für die Bereitstellung der Plattform und der damit verbundenen Dienstleistungen
					gemäß diesen Bedingungen. Es werden wirtschaftlich vertretbare Anstrengungen unternommen, um branchenübliche
					Standards einzuhalten, jedoch wird keine ununterbrochene Verfügbarkeit garantiert.
				</p>
				<p>
					6.2. Buchungsanbieter behält sich vor, Teile oder die gesamte Plattform für Wartungsarbeiten oder
					Verbesserungen vorübergehend außer Betrieb zu nehmen.
				</p>
				<p>
					6.3. Die Nutzung der Plattform erfolgt auf eigenes Risiko des Nutzers. Soweit gesetzlich zulässig, wird die
					Plattform „wie besehen“ bereitgestellt, ohne Gewährleistung für Mängelfreiheit.
				</p>
				<p>
					6.4. Der Nutzer stellt Buchungsanbieter von sämtlichen Schäden frei, die aus einer rechtswidrigen Nutzung der
					Plattform oder einem Verstoß gegen diese Bedingungen resultieren.
				</p>

				<h2 class="font-semibold text-lg">7. Verarbeitung personenbezogener Daten</h2>
				<p>
					7.1. Bei der Verarbeitung personenbezogener Daten im Zusammenhang mit der Buchung sportlicher Angebote
					übernimmt der Veranstalter die Rolle des Auftragsverarbeiters. Buchungsanbieter verarbeitet diese Daten
					ausschließlich auf Anweisung des Veranstalters. Es wird empfohlen, die Datenschutzerklärung des Veranstalters
					zu konsultieren.
				</p>
				<p>
					7.2. Buchungsanbieter kann personenbezogene Daten auch für eigene Zwecke, etwa zur Analyse der
					Plattformnutzung, verarbeiten. Weitere Informationen hierzu finden Sie in unserer Datenschutz- und
					Cookie-Erklärung.
				</p>

				<h2 class="font-semibold text-lg">8. Geistiges Eigentum und Nutzungsrechte</h2>
				<p>
					8.1. Buchungsanbieter gewährt dem Nutzer eine nicht ausschließliche, nicht übertragbare und widerrufliche
					Lizenz zur Nutzung der Plattform, ausschließlich zum Zweck der Buchung sportlicher Angebote.
				</p>
				<p>
					8.2. Die Nutzung der Plattform ist ausschließlich persönlich gestattet. Eine Weitergabe an Dritte bedarf der
					vorherigen schriftlichen Zustimmung von Buchungsanbieter.
				</p>
				<p>
					8.3. Alle Rechte an geistigem Eigentum in Bezug auf die Plattform, einschließlich Quellcodes, Designs, Logos
					und weiterer Inhalte, liegen ausschließlich bei Buchungsanbieter.
				</p>
				<p>
					8.4. Jegliche Entfernung oder Umgehung technischer Schutzmaßnahmen berechtigt Buchungsanbieter, den Zugang des
					Nutzers zur Plattform unverzüglich zu sperren und gegebenenfalls Schadensersatz zu fordern.
				</p>

				<h2 class="font-semibold text-lg">9. Haftung</h2>
				<p>
					9.1. Buchungsanbieter haftet gegenüber dem Nutzer nur bei Vorsatz oder grober Fahrlässigkeit für Schäden, die
					aus der Nutzung der Plattform oder der Inanspruchnahme der Dienstleistungen entstehen.
				</p>
				<p>9.2. Eine Haftung für indirekte Schäden, wie entgangenen Gewinn oder Datenverlust, wird ausgeschlossen.</p>
				<p>
					9.3. Soweit Buchungsanbieter haftet, ist die Gesamthaftung auf maximal 500 EUR begrenzt, sofern keine
					zwingenden gesetzlichen Vorschriften anderes bestimmen.
				</p>

				<h2 class="font-semibold text-lg">10. Laufzeit und Beendigung</h2>
				<p>
					10.1. Der Vertrag wird auf unbestimmte Zeit geschlossen und kann von beiden Parteien jederzeit schriftlich
					gekündigt werden.
				</p>
				<p>
					10.2. Buchungsanbieter behält sich das Recht vor, den Vertrag bei Verstoß gegen diese Bedingungen mit
					sofortiger Wirkung zu kündigen, ohne dass es einer weiteren Mahnung bedarf.
				</p>
				<p>10.3. Bereits in Anspruch genommene Leistungen bleiben auch bei Vertragsbeendigung bestehen.</p>
				<p>
					10.4. Im Falle der Vertragsbeendigung ist Buchungsanbieter berechtigt, dem Nutzer den Zugang zur Plattform
					sofort zu verweigern und alle gespeicherten Daten, einschließlich Buchungsbestätigungen, zu löschen oder
					unzugänglich zu machen.
				</p>

				<h2 class="font-semibold text-lg">11. Anwendbares Recht und Streitigkeiten</h2>
				<p>11.1. Für diese Bedingungen gilt ausschließlich deutsches Recht.</p>
				<p>
					11.2. Ausschließlicher Gerichtsstand für alle Streitigkeiten im Zusammenhang mit dem Vertrag ist
					[Gerichtsstand einfügen], sofern gesetzlich zulässig.
				</p>

				<h2 class="font-semibold text-lg">12. Kontaktangaben</h2>
				<p>
					12.1. Bei Fragen zu diesen Bedingungen können sich Nutzer schriftlich oder per E-Mail an Buchungsanbieter
					wenden: Funkhaus Sports GmbH, [Adresse einfügen], Deutschland, E-Mail: info@funkhaus-sports.com.
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
