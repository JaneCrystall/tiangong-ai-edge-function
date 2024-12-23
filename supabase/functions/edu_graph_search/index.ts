// Setup type definitions for built-in Supabase Runtime APIs
import '@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from '@supabase/supabase-js@2';
import { Redis } from '@upstash/redis';
import neo4j from 'neo4j-driver';
import { corsHeaders } from '../_shared/cors.ts';
import generateQuery from '../_shared/generate_query.ts';
import supabaseAuth from '../_shared/supabase_auth.ts';
import logInsert from '../_shared/supabase_function_log.ts';

const neo4j_url = Deno.env.get('NEO4J_URI') ?? '';
const neo4j_user = Deno.env.get('NEO4J_USER') ?? '';
const neo4j_password = Deno.env.get('NEO4J_PASSWORD') ?? '';

const supabase_url = Deno.env.get('LOCAL_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const supabase_anon_key =
  Deno.env.get('LOCAL_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const redis_url = Deno.env.get('UPSTASH_REDIS_URL') ?? '';
const redis_token = Deno.env.get('UPSTASH_REDIS_TOKEN') ?? '';

const driver = neo4j.driver(neo4j_url, neo4j.auth.basic(neo4j_user, neo4j_password));

const supabase = createClient(supabase_url, supabase_anon_key);

const redis = new Redis({
  url: redis_url,
  token: redis_token,
});

const search = async (full_text_query: string[], root: number, depth: number) => {
  const searchText = full_text_query.join(' ');
  const { records } = await driver.executeQuery(
    `CALL db.index.fulltext.queryNodes("concept_fulltext_index","${searchText}") YIELD node,score WITH node AS startNode ORDER BY score DESC LIMIT ${root} MATCH path = (startNode)-[r:HAS_PART*..${depth}]->(endNode) WHERE NOT (endNode)-->() RETURN path`,
  );

  await driver.close();

  return records;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const email = req.headers.get('email') ?? '';
  const password = req.headers.get('password') ?? '';

  if (!(await redis.exists(email))) {
    const authResponse = await supabaseAuth(supabase, email, password);
    if (authResponse.status !== 200) {
      return authResponse;
    } else {
      await redis.setex(email, 3600, '');
    }
  }

  const { query, root = 1, depth = 3 } = await req.json();
  // console.log(query, filter);

  logInsert(email, Date.now(), 'edu_graph_search', root, depth);

  const res = await generateQuery(query);
  // console.log(res);
  const result = await search(
    [...res.fulltext_query_chi_sim, ...res.fulltext_query_eng],
    root,
    depth,
  );
  // console.log(result);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});