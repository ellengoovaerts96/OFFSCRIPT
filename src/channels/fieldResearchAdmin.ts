import { Router } from 'express';
import { requireAdminBasicAuth, requireAdminCsrf, adminCsrfToken } from '../middleware/adminBasicAuth.js';
import { listResearch, getResearch, saveResearch, placeChoices, approvalPreview, approveResearch, researchSyncState } from '../data/fieldResearchRepository.js';
import { renderResearchList, renderResearchDetail, renderResearchMatches, renderResearchApproval, researchPage } from '../logic/fieldResearchHtml.js';
import { researchStatuses, reviewedInput, readResearchPlan } from '../logic/fieldResearch.js';
import { syncFieldResearch, researchStaging } from '../services/fieldResearchSync.js';
import { escapeHtml } from '../logic/sourcesAdminHtml.js';
export const fieldResearchAdminRouter = Router();
fieldResearchAdminRouter.use(requireAdminBasicAuth);
fieldResearchAdminRouter.use((_req, res, next) => { if (!researchStaging()) {
    res.status(403).send('Field Research review is currently available on staging only.');
    return;
} next(); });
const admin = () => process.env.INBOX_USERNAME ?? 'admin';
const idValid = (value: unknown) => /^[1-9]\d{0,17}$/.test(String(value));
function errorPage(res: any, error: unknown) { const message = error instanceof Error ? error.message : 'Could not complete this action.'; console.error('Field Research admin', error); res.status(400).type('html').send(researchPage('Action not completed', `<p role="alert" class="error">${escapeHtml(message)}</p><p>Your raw submission is preserved.</p><a href="/admin/field-research">Back to Field Research</a>`)); }
fieldResearchAdminRouter.get('/', async (req, res) => { try {
    const filters = Object.fromEntries(['q', 'status', 'area', 'category', 'from', 'to', 'page'].map(key => [key, typeof req.query[key] === 'string' ? req.query[key] as string : '']));
    res.type('html').send(renderResearchList(await listResearch(), filters, await researchSyncState(), adminCsrfToken()));
}
catch (error) {
    errorPage(res, error);
} });
fieldResearchAdminRouter.post('/sync', requireAdminCsrf, (_req, res) => { void syncFieldResearch().catch(error => console.error('Requested Field Research sync failed', error)); res.redirect(303, '/admin/field-research'); });
fieldResearchAdminRouter.get('/:id', async (req, res) => { try {
    if (!idValid(req.params.id))
        throw new Error('Invalid submission.');
    const item = await getResearch(String(req.params.id));
    if (!item) {
        res.status(404).send('Submission not found.');
        return;
    }
    res.type('html').send(renderResearchDetail(item, adminCsrfToken()));
}
catch (error) {
    errorPage(res, error);
} });
fieldResearchAdminRouter.post('/:id', requireAdminCsrf, async (req, res) => {
    try {
        if (!idValid(req.params.id))
            throw new Error('Invalid submission.');
        const item = await getResearch(String(req.params.id));
        if (!item)
            throw new Error('Submission not found.');
        const status = req.body.action === 'preview' ? 'in_review' : req.body.status;
        if (!Object.keys(researchStatuses).includes(status))
            throw new Error('Invalid review status.');
        await saveResearch(item.id, Number(req.body.version), String(req.body.rawHash), reviewedInput(req.body, item.payload), status, admin());
        res.redirect(303, `/admin/field-research/${item.id}${req.body.action === 'preview' ? '/matches' : ''}`);
    }
    catch (error) {
        errorPage(res, error);
    }
});
fieldResearchAdminRouter.get('/:id/matches', async (req, res) => { try {
    if (!idValid(req.params.id))
        throw new Error('Invalid submission.');
    const item = await getResearch(String(req.params.id));
    if (!item)
        throw new Error('Submission not found.');
    res.type('html').send(renderResearchMatches(item, await placeChoices(item), adminCsrfToken()));
}
catch (error) {
    errorPage(res, error);
} });
fieldResearchAdminRouter.get('/:id/preview', async (req, res) => {
    try {
        if (!idValid(req.params.id))
            throw new Error('Invalid submission.');
        const item = await getResearch(String(req.params.id));
        if (!item)
            throw new Error('Submission not found.');
        const action = req.query.action;
        if (action !== 'create' && action !== 'update')
            throw new Error('Choose create or update.');
        const placeId = typeof req.query.placeId === 'string' ? req.query.placeId : null;
        if (placeId && !/^[0-9a-f-]{36}$/i.test(placeId))
            throw new Error('Invalid place.');
        res.type('html').send(renderResearchApproval(item, await approvalPreview(item, action, placeId), adminCsrfToken()));
    }
    catch (error) {
        errorPage(res, error);
    }
});
fieldResearchAdminRouter.post('/:id/approve', requireAdminCsrf, async (req, res) => {
    try {
        if (req.body.confirmed !== 'yes')
            throw new Error('Confirm the reviewed changes first.');
        const plan = readResearchPlan(req.body.plan);
        if (plan.rawId !== String(req.params.id))
            throw new Error('Invalid approval target.');
        const fields = Array.isArray(req.body.fields) ? req.body.fields : typeof req.body.fields === 'string' ? [req.body.fields] : [];
        if (fields.some((field: unknown) => typeof field !== 'string'))
            throw new Error('Invalid fields.');
        await approveResearch(plan, fields, admin());
        res.redirect(303, '/admin/field-research/' + plan.rawId);
    }
    catch (error) {
        errorPage(res, error);
    }
});
