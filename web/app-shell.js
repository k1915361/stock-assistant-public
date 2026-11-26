// @ts-check
'use strict';
// Page helpers and the app globals that the other app scripts read. Loaded first among them. Holds no workspace state and renders nothing.
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native = window.Native || null;
let catalogue, baseCatalogue, documents, currentProduct, lastMatches = [], renderCounter = 0, timer = null, placementIndex=0, appHistoryReady=false, appHistoryMaxIndex=0, shownQuery='', pendingLookup=null, catalogueLoading=false;
const initialWelcomeHTML=$('results').innerHTML;
