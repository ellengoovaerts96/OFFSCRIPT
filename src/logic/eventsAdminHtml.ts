import { weekdayNames } from "./eventRecurrence.js";
import { escapeHtml as e } from "./sourcesAdminHtml.js";
import { emptyEvent, fillEventVenue, sourceTypes, type EventContext, type EventData, type EventSource, type EventVenue, type ExtractedEvent } from "./eventImport.js";
import type { AdminEvent } from "../data/eventsRepository.js";

const labels: Record<string, string> = { title: "Event title", venueName: "Venue / place name", neighbourhood: "Neighbourhood", area: "Area", googleMapsUrl: "Google Maps link", eventDate: "Event date / active from (weekly)", recurrenceUntil: "Repeat until (optional)", dateText: "Date as written in the source", startTime: "Start time", endTime: "End time", category: "Event type / category (e.g. workshop, music, family)", description: "Short description", price: "Price / entrance fee", conditions: "Entrance conditions", reservationRequired: "Reservation required", childFriendly: "Child friendly", contactPhone: "Contact phone", instagramAccount: "Instagram account", recurrence: "Recurrence as written in the source", sourceType: "Source type", sourceUrl: "Source URL", verificationNotes: "Your verification notes" };
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · TUUTI</title><link rel="icon" href="/admin-assets/tuuti_dashboard_flavicon.png"><style>
  *{box-sizing:border-box}body{margin:0;background:#f2ebd9;color:#102a24;font:16px/1.5 system-ui,sans-serif}header{background:#102a24;color:#f2ebd9;border-bottom:3px solid #d95b32;padding:18px 5%}header a{color:inherit;text-decoration:none;font-weight:750;letter-spacing:.22em}main{max-width:1180px;margin:32px auto;padding:0 20px}h1,h2,h3{font-family:Georgia,serif;font-weight:500;line-height:1.2}h1{font-size:38px;margin:0}h2{font-size:25px}a{color:inherit}button,.button{display:inline-block;background:#102a24;color:#fffaf0;border:1px solid #102a24;border-radius:5px;padding:11px 17px;text-decoration:none;font:inherit;cursor:pointer}.secondary{background:transparent;color:#102a24}.top,.actions{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.top{margin-bottom:24px}.panel{background:#fffaf0;border:1px solid #d7d1c1;border-radius:8px;padding:24px;margin-bottom:20px}.review{display:grid;grid-template-columns:minmax(270px,.8fr) minmax(350px,1.2fr);gap:24px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wide{grid-column:1/-1}label{display:block;font-size:14px;font-weight:600}input,textarea,select{width:100%;margin-top:6px;padding:10px;border:1px solid #a7b0a3;border-radius:4px;background:#fff;font:inherit;color:#102a24}textarea{min-height:95px;resize:vertical}.meta,small{font-size:13px;color:#626f60}.notice{padding:13px 16px;border-radius:5px;background:#edf2e3;margin:16px 0}.warning{background:#fff0ca;color:#72500b}.error{background:#fbe3dc;color:#852e20}.uncertain input,.uncertain textarea,.uncertain select{border:2px solid #b88421}.field-note{display:block;font-size:12px;color:#815807;margin-top:5px}.source-image{width:100%;max-height:75vh;object-fit:contain;background:#eee8d8;border-radius:5px}.dropzone{border:2px dashed #83937b;border-radius:8px;padding:35px 20px;text-align:center;background:#f7f3e8}.dropzone.drag{background:#e3edd8;border-color:#102a24}.event{display:block;text-decoration:none;padding:18px;border-bottom:1px solid #d7d1c1}.event:last-child{border-bottom:0}.event strong{font-size:19px}.pill{display:inline-block;border-radius:20px;background:#eee6cd;padding:3px 9px;font-size:12px}details{margin-top:15px}button:disabled{opacity:.6;cursor:wait}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.sticky{position:sticky;top:20px;align-self:start}@media(max-width:760px){.review,.fields{grid-template-columns:1fr}.sticky{position:static}.wide{grid-column:auto}.panel{padding:17px}main{padding:0 12px}h1{font-size:31px}}
  </style></head><body><header><a href="/admin">TUUTI</a> <span class="meta" style="color:#ddd"> / EVENTS</span></header><main>${body}</main></body></html>`;
}
const option = (value: string, current: unknown, title = value) => `<option value="${e(value)}"${value === current ? " selected" : ""}>${e(title)}</option>`;
function contextFields(context: EventContext): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `<div class="fields"><label>Month (optional)<select name="month">${option("", context.month ? String(context.month) : "", "Unknown")}${months.map((month, i) => option(String(i + 1), String(context.month), month)).join("")}</select></label><label>Year (optional)<input name="year" type="number" min="1900" max="2200" placeholder="e.g. 2026" value="${e(context.year ?? "")}"></label><label class="wide">Publication date (optional)<input name="publicationDate" type="date" value="${e(context.publicationDate ?? "")}"><small>Only supply a date you know. Needed to interpret “this Saturday”; upload time is never used as publication date.</small></label></div>`;
}
export function renderEventImport(input: { csrf: string; error?: string; cloudinaryReady: boolean; openaiReady: boolean; values?: Record<string, unknown> }): string {
  const values = input.values ?? {};
  const context: EventContext = { month: Number(values.month) || null, year: Number(values.year) || null, publicationDate: String(values.publicationDate ?? "") || null };
  return page("Import event from screenshot", `<div class="top"><h1>Import event from screenshot</h1><a href="/admin/events">Back to Events</a></div><p>Upload → extract → review → Save event. Nothing is saved as an event or published automatically.</p>
  ${input.error ? `<p role="alert" class="notice error">${e(input.error)}</p>` : ""}
  ${!input.cloudinaryReady ? `<p class="notice warning">Screenshot storage is unavailable. Configure Cloudinary or <a href="/admin/events/new">create an event manually</a>.</p>` : ""}
  ${!input.openaiReady ? `<p class="notice warning">Automatic extraction is unavailable. You can still upload a source and fill in the review form manually.</p>` : ""}
  <form class="panel" id="import-form" action="/admin/events/import" method="post" enctype="multipart/form-data"><input type="hidden" name="_csrf" value="${e(input.csrf)}">
  <label class="dropzone" id="dropzone">Drop your PNG screenshot here, or choose a file<input id="screenshot" type="file" name="screenshot" accept="image/png,image/jpeg,image/heic,image/heif,.png,.jpg,.jpeg,.heic,.heif" required><span id="file-note" class="meta">PNG · JPG · HEIC — up to 12 MB. The original is preserved.</span></label>
  <div class="fields" style="margin:20px 0"><label>Source type<select name="sourceType">${sourceTypes.map(type => option(type, values.sourceType ?? "unknown", type === "unknown" ? "Detect from screenshot / unknown" : type)).join("")}</select></label><label>Source URL (optional)<input name="sourceUrl" type="url" value="${e(values.sourceUrl ?? "")}" placeholder="https://…"></label></div>
  <h2>Date context</h2><p class="meta">For a flyer saying “Saturday 19”, you can supply the month and year. These values are context, not proof of the event date.</p>${contextFields(context)}
  <div class="actions" style="margin-top:24px"><button id="extract-button"${!input.cloudinaryReady ? " disabled" : ""}>Extract &amp; review</button><a href="/admin/events/new">Enter manually</a><span id="progress" role="status"></span></div></form>
  <script>const zone=document.getElementById('dropzone'),file=document.getElementById('screenshot');zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');if(e.dataTransfer.files.length===1){file.files=e.dataTransfer.files;file.dispatchEvent(new Event('change'))}else{document.getElementById('file-note').textContent='Please upload one screenshot at a time.'}});file.addEventListener('change',()=>{const selected=file.files[0];file.setCustomValidity(selected&&selected.size>12*1024*1024?'Maximum file size is 12 MB.':'');document.getElementById('file-note').textContent=selected?selected.name+' · '+(selected.size/1024/1024).toFixed(1)+' MB':'PNG · JPG · HEIC'});document.getElementById('import-form').addEventListener('submit',()=>{document.getElementById('extract-button').disabled=true;document.getElementById('progress').textContent='Uploading and reading screenshot… Please wait.'});</script>`);
}
export function renderEventsList(events: AdminEvent[]): string {
  return page("Events", `<div class="top"><div><h1>Events</h1><p class="meta">Manage event drafts and events available to the chatbot.</p></div><div class="actions"><a class="button" href="/admin/events/import">+ Import from screenshot</a><a class="button secondary" href="/admin/events/new">+ New event</a></div></div><p><a href="/admin">Dashboard</a> · <a href="/admin/places">Places</a></p><section class="panel">${events.length ? events.map(event => `<a class="event" href="/admin/events/${event.id}"><strong>${e(event.data.title)}</strong> <span class="pill">${event.data.status === "published" ? "Available to chatbot" : "Draft"}</span><div>${e(event.data.venueName || "Venue not specified")} · ${e(event.data.recurrenceFrequency === "weekly" ? "Weekly · " + (event.data.recurrenceWeekday == null ? "Choose weekday" : weekdayNames[Number(event.data.recurrenceWeekday)] ?? "Choose weekday") + " · from " + (event.data.eventDate || "date unknown") + (event.data.recurrenceUntil ? " until " + event.data.recurrenceUntil : "") : (event.data.eventDate || event.data.dateText || "Date unknown"))} ${e(event.data.startTime ?? "")}</div></a>`).join("") : `<p>No events yet. Import your first screenshot or create an event manually.</p>`}</section>`);
}
export function renderEventReview(input: { csrf: string; token?: string; id?: string; data?: Partial<EventData>; source: EventSource | null; extraction: ExtractedEvent | null; context: EventContext; venues: EventVenue[]; error?: string; saved?: boolean }): string {
  let data = { ...emptyEvent(), ...input.data };
  const selectedVenue = input.venues.find(venue => venue.kind === "event" ? venue.id === data.eventVenueId : venue.id === data.placeId);
  if (selectedVenue) data = fillEventVenue(data, selectedVenue);
  const warnings = input.extraction?.uncertainFields ?? [];
  const field = (name: keyof EventData, type = "text", wide = false) => {
    const notes = warnings.filter(warning => warning.field === name);
    return `<label class="${wide ? "wide " : ""}${notes.length ? "uncertain" : ""}">${e(labels[name] ?? name)}${type === "textarea" ? `<textarea name="${name}">${e(data[name] ?? "")}</textarea>` : `<input name="${name}" type="${type}" value="${e(data[name] ?? "")}"${name === "title" ? ' required maxlength="300"' : ""}>`}${notes.map(note => `<span class="field-note">⚠ ${e(note.note)}</span>`).join("")}</label>`;
  };
  const venueOption = (venue: EventVenue) => `<option value="${venue.kind === "event" ? "event" : "place"}:${e(venue.id)}" data-venue="${e(JSON.stringify(venue))}"${venue.id === (venue.kind === "event" ? data.eventVenueId : data.placeId) ? " selected" : ""}>${e([venue.name, venue.neighbourhood, venue.area, venue.kind === "event" ? "Event venue" : "Place"].filter(Boolean).join(" — "))}</option>`;
  return page(input.id ? "Edit event" : "Review extracted event", `<div class="top"><div><h1>${input.id ? "Edit event" : "Review event"}</h1><p class="meta">Check the details against the source before saving. Times are local to the venue.</p></div><a href="/admin/events">Back to Events</a></div>
  ${input.error ? `<p role="alert" class="notice error">${e(input.error)}</p>` : ""}${input.saved ? `<p class="notice" role="status">${data.status === "published" ? "Event saved and available to the chatbot on its date." : "Event saved as a draft. It is not available to the chatbot."}</p>` : ""}
  <div class="review"><aside class="panel sticky"><h2>Source / verification</h2>${input.source ? `<a href="${e(input.source.originalUrl)}" target="_blank" rel="noreferrer"><img class="source-image" src="${e(input.source.previewUrl)}" alt="Original event screenshot for verification"></a><p class="meta">${e(input.source.filename)} · ${e(input.source.format.toUpperCase())}<br><a href="${e(input.source.originalUrl)}" target="_blank" rel="noreferrer">Open original screenshot</a></p>` : `<p class="meta">No screenshot attached. This event was entered manually.</p>`}
  ${warnings.length ? `<div class="notice warning"><strong>Verify these details</strong><ul>${warnings.map(item => `<li>${e(labels[item.field])}: ${e(item.note)}</li>`).join("")}</ul></div>` : ""}
  ${input.source && input.token && !input.id ? `<details><summary>Change month / year and retry extraction</summary><form method="post" action="/admin/events/import/retry"><input type="hidden" name="_csrf" value="${e(input.csrf)}"><input type="hidden" name="draft" value="${e(input.token)}"><input type="hidden" name="sourceUrl" value="${e(data.sourceUrl)}"><input type="hidden" name="sourceType" value="${e(data.sourceType)}">${contextFields(input.context)}<p class="meta">Re-extraction replaces the form fields. Your current edits will not be carried over.</p><button>Re-extract &amp; review</button></form></details>` : ""}
  ${input.extraction ? `<details><summary>Original AI extraction and date context</summary><pre>${e(JSON.stringify({ context: input.context, extraction: input.extraction }, null, 2))}</pre></details>` : ""}</aside>
  <section class="panel"><form method="post" action="${input.id ? `/admin/events/${input.id}` : "/admin/events"}"><input type="hidden" name="_csrf" value="${e(input.csrf)}">${input.token ? `<input type="hidden" name="draft" value="${e(input.token)}">` : ""}
  <div class="fields">${field("title", "text", true)}${field("venueName", "text", true)}${field("neighbourhood")}${field("area")}${field("googleMapsUrl", "url", true)}
  <div class="wide"><button type="button" class="secondary" id="location-lookup">Zoek ontbrekende locatiegegevens</button><p class="meta">Find missing neighbourhood, area, Maps link and phone online. Review each proposal and its source before using it. Existing values stay unchanged.</p><div id="location-results" aria-live="polite"></div></div>
  <label class="wide">Existing place or saved event venue (optional)<select id="venue-select">${option("", selectedVenue ? "selected" : "", "New event venue — save these location details for reuse")}${input.venues.map(venueOption).join("")}</select><input type="hidden" name="placeId" value="${e(data.placeId ?? "")}"><input type="hidden" name="eventVenueId" value="${e(data.eventVenueId ?? "")}"><small>Missing details are filled from the selected venue. Your event-specific edits are preserved. New venues are saved for reuse when you save the event; they are not added to Places.</small></label>

  ${field("dateText", "text", true)}${field("eventDate", "date", true)}
  <label>Repeat<select name="recurrenceFrequency">${option("none", data.recurrenceFrequency, "One-time event")}${option("weekly", data.recurrenceFrequency, "Every week")}</select></label>
  <label>Weekday (weekly events)<select name="recurrenceWeekday">${option("", data.recurrenceWeekday ?? "", "Select weekday")}${weekdayNames.map((day,index)=>option(String(index),data.recurrenceWeekday,day)).join("")}</select></label>
  ${field("recurrenceUntil", "date", true)}<p class="wide meta">For a weekly event, choose when the schedule becomes active and its weekday. Leave the end date empty to continue until you change it to Draft. Source text alone does not activate a repeating schedule.</p>${field("startTime", "time")}${field("endTime", "time")}${field("category", "text", true)}${field("description", "textarea", true)}${field("price")}${field("conditions")}
  <label class="${warnings.some(item => item.field === "reservationRequired") ? "uncertain" : ""}">Reservation required<select name="reservationRequired">${["unknown", "yes", "no"].map(value => option(value, data.reservationRequired)).join("")}</select></label><label class="${warnings.some(item => item.field === "childFriendly") ? "uncertain" : ""}">Child friendly<select name="childFriendly">${["unknown", "yes", "no"].map(value => option(value, data.childFriendly)).join("")}</select><small>Use unknown when the source does not specify suitability for children. Put age limits in the description.</small></label>${field("contactPhone", "tel")}${field("instagramAccount")}${field("recurrence")}
  <label>Source type<select name="sourceType">${sourceTypes.map(type => option(type, data.sourceType)).join("")}</select></label>${field("sourceUrl", "url")}${field("verificationNotes", "textarea", true)}</div>
  <p class="meta">Unknown details may stay empty in a draft. Only manually approved events with a full date and venue can be made available to the chatbot.</p><label>Visibility<select name="status">${option("draft", data.status, "Draft — not available to chatbot")}${option("published", data.status, "Reviewed — available to chatbot")}</select></label><label><input style="width:auto" type="checkbox" name="reviewed" value="yes" required> I checked the event details and the uncertainties above.</label><div class="actions" style="margin-top:20px"><button>${input.id ? "Save changes" : "Save event"}</button><a href="/admin/events">Cancel</a></div></form></section></div><script>
  const select=document.getElementById('venue-select'),form=select.closest('form');
  const fields={venueName:'name',neighbourhood:'neighbourhood',area:'area',googleMapsUrl:'googleMapsUrl',contactPhone:'contactPhone'};
  let inherited={};
  function readVenue(){const option=select.selectedOptions[0];return option?.dataset.venue?JSON.parse(option.dataset.venue):null}
  const initial=readVenue();if(initial){for(const [field,key] of Object.entries(fields)){if(form.elements[field].value===(initial[key]||''))inherited[field]=form.elements[field].value}}
  for(const field of Object.keys(fields))form.elements[field].addEventListener('input',()=>{delete inherited[field]});
  select.addEventListener('change',()=>{const venue=readVenue();form.elements.placeId.value=venue&&venue.kind!=='event'?venue.id:'';form.elements.eventVenueId.value=venue&&venue.kind==='event'?venue.id:'';
  for(const [field,key] of Object.entries(fields)){const el=form.elements[field];if(!el.value||el.value===inherited[field]){el.value=venue?(venue[key]||''):'';inherited[field]=el.value}}});
  const lookupButton=document.getElementById('location-lookup'),lookupResults=document.getElementById('location-results');
  const lookupFields={neighbourhood:'Neighbourhood',area:'Area',googleMapsUrl:'Google Maps link',contactPhone:'Contact phone'};
  let lookupVersion=0;
  function invalidateLookup(){lookupVersion++;lookupResults.replaceChildren()}
  for(const name of ['venueName','neighbourhood','area','instagramAccount','sourceUrl'])form.elements[name].addEventListener('input',invalidateLookup);
  select.addEventListener('change',invalidateLookup);
  lookupButton.addEventListener('click',async()=>{
    const missingFields=Object.keys(lookupFields).filter(name=>!form.elements[name].value.trim());
    lookupResults.replaceChildren();
    if(!missingFields.length){lookupResults.textContent='All location fields are already filled in.';return}
    if(form.elements.venueName.value.trim().length<2){lookupResults.textContent='Enter a venue name first.';return}
    const version=++lookupVersion;
    const context=Object.fromEntries(['venueName','neighbourhood','area','instagramAccount','sourceUrl'].map(name=>[name,form.elements[name].value.trim()]));
    lookupButton.disabled=true;lookupResults.textContent='Searching public sources…';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),40000);
    try{
      const response=await fetch('/admin/events/location-lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...context,missingFields,_csrf:form.elements._csrf.value}),signal:controller.signal});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Lookup failed. Please retry.');
      if(version!==lookupVersion)return;
      lookupResults.replaceChildren();
      const heading=document.createElement('p');heading.textContent=[result.venueName,result.address,result.explanation].filter(Boolean).join(' — ');lookupResults.append(heading);
      if(!result.suggestions.length){const empty=document.createElement('p');empty.textContent='No verified proposals found. Add more location context or fill in the details manually.';lookupResults.append(empty)}
      for(const suggestion of result.suggestions){
        const card=document.createElement('div');card.className='notice warning';
        const value=document.createElement('strong');value.textContent=lookupFields[suggestion.field]+': '+suggestion.value;
        const evidence=document.createElement('p');evidence.textContent=suggestion.evidence;
        const source=document.createElement('a');source.href=suggestion.sourceUrl;source.textContent='Check source';source.target='_blank';source.rel='noopener noreferrer';
        const apply=document.createElement('button');apply.type='button';apply.className='secondary';apply.textContent='Use proposal';apply.style.marginLeft='12px';
        apply.addEventListener('click',()=>{
          if(version!==lookupVersion)return;
          const field=form.elements[suggestion.field];
          if(field.value.trim()){apply.textContent='Field already filled';apply.disabled=true;return}
          field.value=suggestion.value;delete inherited[suggestion.field];form.elements.reviewed.checked=false;
          const note='Location lookup — '+lookupFields[suggestion.field]+': '+suggestion.value+' — '+suggestion.sourceUrl;
          form.elements.verificationNotes.value+=(form.elements.verificationNotes.value?String.fromCharCode(10):'')+note;
          apply.textContent='Added — save event to keep';apply.disabled=true;
        });
        card.append(value,evidence,source,apply);lookupResults.append(card);
      }
    }catch(error){if(version===lookupVersion)lookupResults.textContent=error.name==='AbortError'?'Search timed out. Your form has not changed.':error.message}
    finally{clearTimeout(timeout);lookupButton.disabled=false}
  });
  </script>`);
}
