/**
 * Run createOffscriptFieldNotesForm once from https://script.google.com.
 * The form and spreadsheet are created in the Google account running the script.
 */
function createOffscriptFieldNotesForm() {
  const form = FormApp.create('OFFSCRIPT – Notes de terrain', true)
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

  form.addParagraphTextItem()
    .setTitle('Note de terrain')
    .setHelpText(
      'Écris librement tout ce que tu as observé : ambiance, public, nourriture, prix, ' +
      'personnes rencontrées, horaires, conseils, changements, points forts et réserves.'
    )
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Ton impression OFFSCRIPT')
    .setHelpText('Facultatif. Choisis seulement si tu as déjà une impression claire.')
    .setChoiceValues([
      '0 – Lieu ordinaire',
      '1 – Recommandé',
      '2 – OFFSCRIPT Favorite',
      '3 – Signature Experience',
      'Je ne sais pas encore'
    ])
    .setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle('Authenticité')
    .setHelpText('Facultatif. Ton jugement sur l’authenticité de l’expérience.')
    .setChoiceValues([
      '0 – Pas pertinent ou pas authentique',
      '1 – Faible',
      '2 – Partielle',
      '3 – Forte',
      '4 – Exceptionnelle',
      'Je ne sais pas encore'
    ])
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Public observé')
    .setHelpText('Facultatif. Plusieurs réponses sont possibles.')
    .setChoiceValues([
      'Résidents',
      'Expatriés',
      'Touristes',
      'Familles',
      'Public jeune',
      'Public professionnel',
      'Voyageurs aventureux',
      'Public mixte',
      'Impossible à estimer'
    ])
    .setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle('Niveau de prix')
    .setHelpText('Facultatif. Estimation relative pour Dakar.')
    .setChoiceValues([
      '1 – Budget',
      '2 – Abordable',
      '3 – Moyen',
      '4 – Chic',
      '5 – Luxe',
      'Impossible à estimer'
    ])
    .setRequired(false);

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

  const spreadsheet = SpreadsheetApp.create('OFFSCRIPT – Field Research Inbox');
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
  structured.getRange(1, 1, 1, 10).setValues([[
    'source_note_id', 'place_name', 'country', 'region', 'neighbourhood', 'area', 'ai_confidence',
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
  const configuredColumn = Number(
    PropertiesService.getScriptProperties().getProperty('OFFSCRIPT_FIELD_NOTES_STATUS_COLUMN')
  );
  if (!event || !event.range || !configuredColumn) return;
  event.range.getSheet().getRange(event.range.getRow(), configuredColumn).setValue('new');
}
