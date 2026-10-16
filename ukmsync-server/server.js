import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PORT = process.env.PORT || 3000;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Health check
// ============================================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ukmsync-server', version: '1.0.0' });
});

// ============================================================
// Lookup: slug → project_id + sync config
// The SDK calls this once on boot.
// ============================================================
app.post('/api/sync/lookup', async (req, res) => {
  const { slug } = req.body || {};
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug is required' });
  }

  // Find project by slug
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('id, name, slug, status, owner_id')
    .eq('slug', slug)
    .maybeSingle();

  if (pErr) return res.status(500).json({ error: pErr.message });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.status === 'paused' || project.status === 'archived') {
    return res.status(403).json({ error: 'Project is not active' });
  }

  // Find sync config
  const { data: config, error: cErr } = await supabase
    .from('sync_configs')
    .select('*')
    .eq('project_id', project.id)
    .maybeSingle();

  if (cErr) return res.status(500).json({ error: cErr.message });

  return res.json({
    project_id: project.id,
    project_name: project.name,
    slug: project.slug,
    config: config || {
      enabled: false,
      conflict_strategy: 'last-write-wins',
      tables_to_sync: [],
      poll_interval_ms: 15000
    }
  });
});

// ============================================================
// Log a sync event
// ============================================================
app.post('/api/sync/log', async (req, res) => {
  const { project_id, client_id, event_type, table_name, record_count, message } = req.body || {};

  if (!project_id || !event_type) {
    return res.status(400).json({ error: 'project_id and event_type required' });
  }

  const allowed = ['queued', 'synced', 'conflict', 'error', 'pull'];
  if (!allowed.includes(event_type)) {
    return res.status(400).json({ error: 'Invalid event_type' });
  }

  const { error } = await supabase.from('sync_logs').insert([{
    project_id,
    client_id: client_id || null,
    event_type,
    table_name: table_name || null,
    record_count: record_count || 0,
    message: message || null
  }]);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ============================================================
// Batch: multiple logs at once
// ============================================================
app.post('/api/sync/log/batch', async (req, res) => {
  const { events } = req.body || {};
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events array required' });
  }

  const allowed = ['queued', 'synced', 'conflict', 'error', 'pull'];
  const rows = [];
  for (const e of events) {
    if (!e.project_id || !e.event_type || !allowed.includes(e.event_type)) continue;
    rows.push({
      project_id: e.project_id,
      client_id: e.client_id || null,
      event_type: e.event_type,
      table_name: e.table_name || null,
      record_count: e.record_count || 0,
      message: e.message || null
    });
  }

  if (rows.length === 0) return res.json({ ok: true, inserted: 0 });

  const { error } = await supabase.from('sync_logs').insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, inserted: rows.length });
});

// ============================================================
// Read recent logs (for SDK / dashboard refresh)
// ============================================================
app.get('/api/sync/logs/:project_id', async (req, res) => {
  const { project_id } = req.params;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .eq('project_id', project_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ logs: data || [] });
});

// ============================================================
// Boot
// ============================================================
app.listen(PORT, () => {
  console.log(`UkmSync server listening on port ${PORT}`);
});
