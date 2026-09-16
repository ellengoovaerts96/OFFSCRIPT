/**
 * Run createTuutiFieldNotesForm once from https://script.google.com.
 * The form and spreadsheet are created in the Google account running the script.
 */
function createTuutiFieldNotesForm() {
  const form = FormApp.create('TUUTI – Notes de terrain', true)
    .setDescription(
      'Note rapidement ce que tu observes, avec tes propres mots. ' +
      'Seule la note de terrain est obligatoire. Les autres questions sont facultatives.'
    )
    .setConfirmationMessage('Merci ! Ta note a bien été enregistrée pour vérification.')
    .setCollectEmail(false)
    .setAllowResponseEdits(true)
    .setProgressBar(false)
    .setShuffleQuestions(false);

  form.addTextItem()
    .setTitle('Nom de la personne qui fait la recherche')
    .setHelpText('Facultatif. Par exemple : Heidi.')
    .setRequired(false);

  form.addDateItem()
    .setTitle('Date de la visite')
    .setHelpText('Facultatif. Indique la date à laquelle le lieu a été visité.')
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Note de terrain')
    .setHelpText(
      'Écris librement tout ce que tu as observé : ambiance, public, nourriture, prix, ' +
      'personnes rencontrées, horaires, conseils, changements, points forts et réserves.'
    )
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Source de l’information')
    .setHelpText('Facultatif. Indique comment tu connais principalement ces informations.')
    .setChoiceValues([
      'Observé personnellement',
      'Confirmé par le propriétaire ou un membre du personnel',
      'Rapporté par une autre personne',
      'À vérifier'
    ])
    .setRequired(false);

  form.addPageBreakItem()
    .setTitle('Évaluation du lieu')
    .setHelpText('Ces questions nous aident à comprendre le type de lieu et à quels voyageurs il peut convenir. Il n’y a pas de bonne ou de mauvaise réponse : évalue le lieu tel que tu l’as réellement vécu.');

  form.addMultipleChoiceItem()
    .setTitle('À quel point ce lieu te semble-t-il authentique ?')
    .setHelpText('L’authenticité ne signifie pas forcément « local » ou « traditionnel ». Un restaurant italien, par exemple, peut aussi être très authentique.')
    .setChoiceValues([
      '0 — Pas authentique / très mis en scène', '1 — Peu authentique', '2 — Mixte / moyen',
      '3 — Authentique', '4 — Très authentique et vraiment distinctif', 'Inconnu'
    ])
    .setRequired(false);

  form.addMultipleChoiceItem().setTitle('Quelle est l’orientation de la cuisine ?')
    .setHelpText('Il s’agit d’une orientation, pas d’une note de qualité.')
    .setChoiceValues(['-2 — Entièrement locale / traditionnelle', '-1 — Principalement locale avec des influences internationales', '0 — Mixte / fusion', '1 — Principalement internationale avec des influences locales', '2 — Entièrement internationale / étrangère', 'Non applicable / inconnu']).setRequired(false);

  form.addMultipleChoiceItem().setTitle('Quel type de public fréquente principalement ce lieu ?')
    .setHelpText('Cette question concerne les personnes qui fréquentent le lieu, pas le type de cuisine.')
    .setChoiceValues(['-2 — Presque exclusivement local', '-1 — Principalement local', '0 — Public mixte', '1 — Principalement expatriés / visiteurs internationaux', '2 — Presque exclusivement international / touristique', 'Inconnu']).setRequired(false);

  form.addCheckboxItem()
    .setTitle('Quels publics correspondent à ce lieu ?').setHelpText('Plusieurs réponses sont possibles.')
    .setChoiceValues(['Habitants / locaux', 'Expatriés', 'Touristes', 'Voyageurs aventureux', 'Familles', 'Public jeune', 'Public professionnel'])
    .setRequired(false);

  form.addMultipleChoiceItem().setTitle('Quel niveau d’ouverture ou d’aventure ce lieu demande-t-il au voyageur ?')
    .setHelpText('Ce n’est pas une note de qualité. Un niveau plus élevé demande davantage de curiosité, de flexibilité ou d’ouverture.')
    .setChoiceValues(['0 — Très accessible et confortable', '1 — Un peu en dehors de l’expérience touristique classique', '2 — Plutôt pour des voyageurs aventureux', '3 — Pour des voyageurs très curieux et flexibles', 'Inconnu']).setRequired(false);

  form.addCheckboxItem().setTitle('Pour quelles occasions ce lieu convient-il particulièrement ?')
    .setHelpText('Plusieurs réponses sont possibles.')
    .setChoiceValues(['Seul', 'En couple', 'Rendez-vous / date', 'Entre amis', 'En famille', 'Coucher de soleil', 'Boire un verre', 'Musique live', 'Se détendre', 'Petit budget', 'Expérience locale', 'Vie nocturne', 'Romantique']).setRequired(false);

  form.addMultipleChoiceItem().setTitle('Est-ce un endroit adapté pour travailler avec un ordinateur ?')
    .setChoiceValues(['Oui', 'Non', 'Non évalué']).setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle('Quel est le niveau de prix ?')
    .setHelpText('Évalue le prix par rapport à des lieux comparables à Dakar / au Sénégal, pas par rapport aux prix européens.')
    .setChoiceValues(['1 — Petit budget', '2 — Abordable', '3 — Prix moyen', '4 — Chic', '5 — Luxe'])
    .setRequired(false);

  form.addPageBreakItem().setTitle('L’avis TUUTI')
    .setHelpText('Cette dernière partie correspond à notre regard éditorial. Après avoir décrit et évalué le lieu, indique à quel point TUUTI devrait le recommander et pourquoi.');

  form.addMultipleChoiceItem()
    .setTitle('À quel point ce lieu est-il un choix TUUTI ?')
    .setHelpText('Ne pense pas seulement à la qualité du lieu. Demande-toi surtout : est-ce un endroit que TUUTI a réellement envie de faire découvrir ?')
    .setChoiceValues(['0 — Lieu standard', '1 — Recommandé', '2 — Favori TUUTI ⭐', '3 — Expérience Signature TUUTI ❤️'])
    .setRequired(false);

  const priorityValidation = FormApp.createTextValidation().requireNumberBetween(0, 100)
    .setHelpText('Indique un nombre entier entre 0 et 100.').build();
  form.addTextItem().setTitle('Quelle priorité TUUTI doit-il donner à ce lieu ?')
    .setHelpText('MATCH FIRST, PRIORITY SECOND. 0–29 faible · 30–49 secondaire · 50–69 bonne · 70–84 forte · 85–94 très forte · 95–100 absolue.')
    .setValidation(priorityValidation).setRequired(false);

  form.addParagraphTextItem().setTitle('Pourquoi TUUTI devrait-il recommander ce lieu ?')
    .setHelpText('Explique brièvement ce qui rend ce lieu intéressant, particulier ou mémorable pour le bon voyageur. Tu peux répondre dans la langue de ton choix.')
    .setRequired(false);

  const spreadsheet = SpreadsheetApp.create('TUUTI – Field Research Inbox');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
  Utilities.sleep(1500);
  SpreadsheetApp.flush();

  const responseSheet = spreadsheet.getSheets().find(sheet =>
    /^Form Responses|^Réponses au formulaire/i.test(sheet.getName())
  ) || spreadsheet.getSheets()[0];
  responseSheet.setName('Field Notes');

  const statusColumn = responseSheet.getLastColumn() + 1;
  responseSheet.getRange(1, statusColumn).setValue('status');
  responseSheet.setFrozenRows(1);

  const structured = spreadsheet.insertSheet('Structured Import');
  structured.getRange(1, 1, 1, 11).setValues([[
    'source_note_id', 'visit_date', 'place_name', 'country', 'region', 'neighbourhood', 'area', 'ai_confidence',
    'review_status', 'reviewed_by', 'review_notes'
  ]]);
  structured.setFrozenRows(1);

  PropertiesService.getScriptProperties().setProperties({
    OFFSCRIPT_FIELD_NOTES_SPREADSHEET_ID: spreadsheet.getId(),
    OFFSCRIPT_FIELD_NOTES_STATUS_COLUMN: String(statusColumn)
  });
  ScriptApp.newTrigger('markNewFieldNote')
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();

  console.log('Formulaire (édition) : ' + form.getEditUrl());
  console.log('Formulaire (réponses) : ' + form.getPublishedUrl());
  console.log('Google Sheet : ' + spreadsheet.getUrl());
}

function markNewFieldNote(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColumn = headers.findIndex(value =>
    String(value).trim().toLowerCase() === 'status'
  ) + 1;
  if (!statusColumn) return;
  sheet.getRange(event.range.getRow(), statusColumn).setValue('new');
}
