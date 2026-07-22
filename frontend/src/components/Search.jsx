import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { getCachedSearch, setCachedSearch } from '../utils/searchCache';
import { splitWithHighlights, countMatches } from '../utils/highlightText';

// ---------------------------------------------------------------------------
// HighlightedText
// Renders a plain string with search terms wrapped in <mark>.
// Uses splitWithHighlights() — no dangerouslySetInnerHTML.
// ---------------------------------------------------------------------------
function HighlightedText({ text, terms, matchMode, className = '' }) {
  if (!text) return null;
  const segments = splitWithHighlights(text, terms, matchMode);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <mark
            key={i}
            className="bg-yellow-200 text-black font-semibold rounded-sm px-0.5"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SnippetWithNav
// Shows a snippet with highlighted matches + Prev/Next navigation.
// Each <mark> gets a unique ID so we can scrollIntoView on it.
// ---------------------------------------------------------------------------
function SnippetWithNav({ snippet, terms, matchMode, docId }) {
  const [currentMatch, setCurrentMatch] = useState(0);

  if (!snippet) return null;

  const segments = splitWithHighlights(snippet, terms, matchMode);
  const matchIndices = segments
    .map((seg, i) => (seg.isMatch ? i : null))
    .filter((i) => i !== null);
  const totalMatches = matchIndices.length;

  // Build rendered elements with IDs on match segments
  let matchCounter = 0;
  const rendered = segments.map((seg, i) => {
    if (seg.isMatch) {
      const matchIdx = matchCounter;
      matchCounter++;
      const isActive = matchIdx === currentMatch;
      return (
        <mark
          key={i}
          id={`match-${docId}-${matchIdx}`}
          className={`rounded-sm px-0.5 font-semibold transition-colors ${
            isActive
              ? 'bg-yellow-400 text-black ring-1 ring-yellow-600'
              : 'bg-yellow-200 text-black'
          }`}
        >
          {seg.text}
        </mark>
      );
    }
    return <span key={i}>{seg.text}</span>;
  });

  const goTo = (idx) => {
    const clamped = Math.max(0, Math.min(totalMatches - 1, idx));
    setCurrentMatch(clamped);
    const el = document.getElementById(`match-${docId}-${clamped}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="my-3">
      <p className="text-xs text-zinc-600 leading-relaxed font-mono bg-zinc-50 p-2.5 border-l-2 border-black">
        {rendered}
      </p>
      {totalMatches > 1 && (
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => goTo(currentMatch - 1)}
            disabled={currentMatch === 0}
            className="text-[10px] font-mono border border-black px-2 py-0.5 bg-white hover:bg-zinc-100 disabled:opacity-30 cursor-pointer select-none"
          >
            ← Prev
          </button>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">
            Match {currentMatch + 1} of {totalMatches}
          </span>
          <button
            onClick={() => goTo(currentMatch + 1)}
            disabled={currentMatch === totalMatches - 1}
            className="text-[10px] font-mono border border-black px-2 py-0.5 bg-white hover:bg-zinc-100 disabled:opacity-30 cursor-pointer select-none"
          >
            Next →
          </button>
        </div>
      )}
      {totalMatches === 1 && (
        <p className="text-[10px] font-mono text-zinc-400 mt-1 uppercase">1 match in snippet</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Search Component
// ---------------------------------------------------------------------------
export default function Search({ onSelectDocument, currentUser, onSearchQueryChange }) {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [myDocs, setMyDocs] = useState(false);
  const [page, setPage] = useState(1);
  const [matchMode, setMatchMode] = useState('partial'); // "whole" | "partial" — partial is default

  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [cacheHit, setCacheHit] = useState(false);

  // Parse active query terms for highlighting
  const queryTerms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 1);

  // Notify parent of current search query (for DocumentModal highlighting)
  useEffect(() => {
    if (onSearchQueryChange) {
      onSearchQueryChange(query.trim() ? queryTerms : [], matchMode);
    }
  }, [query, matchMode]);

  // ── Perform search ──────────────────────────────────────────────────────
  const performSearch = async (q, tagList, from, to, myDocsOnly, pageNum, mode) => {
    if (!q || q.trim() === '') {
      setResults([]);
      setPagination({ page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false });
      setSearched(false);
      setCacheHit(false);
      return;
    }

    const params = {
      q: q.trim(),
      tags: tagList ? tagList.trim() : undefined,
      dateFrom: from || undefined,
      dateTo: to || undefined,
      myDocs: myDocsOnly ? 'true' : 'false',
      page: pageNum,
      limit: 10,
      matchMode: mode,
    };

    // ── Check browser localStorage cache first ────────────────────────────
    const browserCached = getCachedSearch(params);
    if (browserCached) {
      setResults(browserCached.results || []);
      setPagination(browserCached.pagination || {});
      setSearched(true);
      setCacheHit(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setCacheHit(false);

    try {
      const response = await api.search.query(params);
      const data = response.data;

      setResults(data.results || []);
      setPagination(data.pagination || {});
      setSearched(true);

      // If it was a Redis cache hit on the server, mark it
      if (data.cacheHit) {
        setCacheHit(true);
      }

      // Store in browser cache for next identical query
      setCachedSearch(params, data);
    } catch (err) {
      setError(err.message || 'Error occurred during search.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Single debounce timer held in a ref — stable across every render.
  // A new closure is NOT created per render, so the timer is truly shared.
  const debounceTimer = useRef(null);

  useEffect(() => {
    // Cancel any pending call from a previous keystroke
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // Empty query — clear results immediately, no API call needed
    if (!query || query.trim() === '') {
      setResults([]);
      setPagination({ page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false });
      setSearched(false);
      setCacheHit(false);
      return;
    }

    // Schedule API call 400ms after the LAST change
    debounceTimer.current = setTimeout(() => {
      performSearch(query, tags, dateFrom, dateTo, myDocs, page, matchMode);
    }, 500);

    // Cancel on unmount or before next effect run
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, tags, dateFrom, dateTo, myDocs, page, matchMode]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) setPage(newPage);
  };

  const handleResetFilters = () => {
    setTags('');
    setDateFrom('');
    setDateTo('');
    setMyDocs(false);
    setMatchMode('partial');
    setPage(1);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">

      {/* Search Header */}
      <div className="mb-8 text-center md:text-left border-b border-black pb-6">
        <h2 className="text-3xl font-extrabold tracking-tighter uppercase font-mono">
          Search Directory
        </h2>
        <p className="text-xs text-zinc-500 font-mono mt-1 uppercase tracking-wider">
          Query indexed text files and word documents with relevance weighting
        </p>
      </div>

      {/* Main Search Bar + Match Mode Toggle */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Type search terms here... (e.g. invoice, manual, report)"
            className="w-full text-base md:text-lg border-2 border-black p-4 pr-40 bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
            autoFocus
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {/* Whole / Partial toggle */}
            <div className="flex border border-black font-mono text-[10px] uppercase overflow-hidden">
              <button
                onClick={() => { setMatchMode('whole'); setPage(1); }}
                className={`px-2.5 py-1.5 transition-colors select-none cursor-pointer ${
                  matchMode === 'whole' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                }`}
                title="Match whole words only (faster)"
              >
                Whole
              </button>
              <button
                onClick={() => { setMatchMode('partial'); setPage(1); }}
                className={`px-2.5 py-1.5 border-l border-black transition-colors select-none cursor-pointer ${
                  matchMode === 'partial' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                }`}
                title="Match partial/prefix — 'li' finds 'like', 'list'"
              >
                Partial
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Filters & Control Grid */}
      <div className="bg-white border border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-8">
        <div className="text-xs uppercase font-mono tracking-wider font-bold mb-3 border-b border-zinc-100 pb-2 flex justify-between items-center">
          <span>Search Modifiers</span>
          <button
            onClick={handleResetFilters}
            className="text-[10px] underline hover:text-black text-zinc-500 cursor-pointer"
          >
            Clear Filters
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Tags */}
          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase font-mono font-semibold text-zinc-600 mb-1">
              Filter by Tags (comma separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => { setTags(e.target.value); setPage(1); }}
              placeholder="finance, 2026, reports"
              className="w-full border border-black p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black focus-ring-monochrome font-mono"
            />
          </div>

          {/* Date Range - From */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-zinc-600 mb-1">
              Uploaded From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full border border-black p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black focus-ring-monochrome font-mono"
            />
          </div>

          {/* Date Range - To */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-zinc-600 mb-1">
              Uploaded To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full border border-black p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black focus-ring-monochrome font-mono"
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center">
          <label className="flex items-center text-xs uppercase font-mono tracking-wide text-zinc-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={myDocs}
              onChange={(e) => { setMyDocs(e.target.checked); setPage(1); }}
              className="mr-2 accent-black w-4 h-4 border border-black focus:outline-none cursor-pointer"
            />
            Limit search to my documents only
          </label>
        </div>
      </div>

      {/* Results View */}
      <div className="space-y-6">

        {/* Error */}
        {error && (
          <div className="p-4 bg-black text-white text-xs font-mono border border-black">
            [ERROR] {error}
          </div>
        )}

        {/* Empty state before typing */}
        {!query && (
          <div className="border border-dashed border-zinc-300 p-12 text-center text-zinc-400 bg-white font-mono text-sm uppercase">
            Start typing above to search the database
          </div>
        )}

        {/* Loading skeleton */}
        {loading && results.length === 0 && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="border border-black p-5 bg-white space-y-3 animate-pulse">
                <div className="h-4 bg-zinc-200 w-1/3"></div>
                <div className="h-3 bg-zinc-200 w-2/3"></div>
                <div className="h-3 bg-zinc-200 w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {/* Search feedback summary */}
        {searched && query && (
          <div className="flex justify-between items-center text-xs font-mono text-zinc-500 uppercase border-b border-zinc-200 pb-2">
            <span>
              Found {pagination.total} matching documents
              {cacheHit && (
                <span className="ml-2 text-[10px] bg-zinc-100 border border-zinc-300 text-zinc-500 px-1.5 py-0.5">
                  CACHED
                </span>
              )}
            </span>
            <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
          </div>
        )}

        {/* Search Results */}
        {searched && results.length > 0 && (
          <div className="space-y-4">
            {results.map((doc) => {
              const docTerms = queryTerms;
              const titleMatchCount = countMatches(doc.title, docTerms, matchMode);
              const snippetMatchCount = doc.matchCount || countMatches(doc.snippet || '', docTerms, matchMode);

              return (
                <div
                  key={doc._id}
                  className="border border-black p-5 bg-white hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-monochrome group"
                >
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-2">
                    {/* Clickable title with highlights */}
                    <button
                      onClick={() => onSelectDocument(doc._id)}
                      className="text-left text-md font-bold tracking-tight group-hover:underline text-black cursor-pointer"
                    >
                      <HighlightedText
                        text={doc.title}
                        terms={docTerms}
                        matchMode={matchMode}
                      />
                    </button>

                    {/* Score badge + type + visibility — score display unchanged per plan */}
                    <div className="flex items-center gap-2 self-start flex-shrink-0">
                      {doc.relevanceScore !== null && doc.relevanceScore !== undefined && (
                        <span className="text-[10px] font-mono bg-black text-white px-2 py-0.5 uppercase">
                          Score: {doc.relevanceScore}
                        </span>
                      )}
                      {doc.mimeType && (
                        <span className="text-[10px] font-mono border border-black bg-zinc-50 px-2 py-0.5 uppercase">
                          {doc.mimeType.split('/')[1] || doc.mimeType}
                        </span>
                      )}
                      {doc.isPublic ? (
                        <span className="text-[10px] font-mono border border-black bg-zinc-100 px-2 py-0.5 uppercase text-zinc-600">
                          Public
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono border border-black bg-black text-white px-2 py-0.5 uppercase">
                          Private
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Snippet / Match location indicator */}
                  {doc.matchLocation === 'content' && doc.snippet ? (
                    // Term found in content body — show highlighted snippet with nav
                    <SnippetWithNav
                      snippet={doc.snippet}
                      terms={docTerms}
                      matchMode={matchMode}
                      docId={doc._id}
                    />
                  ) : doc.matchLocation === 'title' ? (
                    // Term matched in title only — content doesn't contain the term
                    <div className="my-3 flex items-center gap-2 text-[10px] font-mono text-zinc-500 bg-zinc-50 border border-zinc-200 px-3 py-2">
                      <span className="text-yellow-500 font-bold">T</span>
                      <span className="uppercase">Match found in title only — not in document body</span>
                      <button
                        onClick={() => onSelectDocument(doc._id)}
                        className="ml-auto underline cursor-pointer hover:text-black"
                      >
                        Open to view →
                      </button>
                    </div>
                  ) : doc.matchLocation === 'tags' ? (
                    // Term matched in tags only — neither title nor content contain it
                    <div className="my-3 text-[10px] font-mono text-zinc-500 bg-zinc-50 border border-zinc-200 px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-zinc-400 font-bold">#</span>
                        <span className="uppercase">Match found in tag{doc.matchedTags?.length !== 1 ? 's' : ''} only — not in document body</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(doc.matchedTags || []).map((tag, i) => (
                          <span key={i} className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-1.5 py-0.5 text-[9px] font-mono">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {doc.summary && (
                    <p className="text-xs text-zinc-500 mb-3 italic">
                      {doc.summary}
                    </p>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-dashed border-zinc-100 text-[10px] font-mono uppercase text-zinc-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Owner: {doc.owner?.fullName || doc.owner?.username || 'Unknown'}</span>
                      <span>•</span>
                      <span>Uploaded: {new Date(doc.createdAt).toLocaleDateString()}</span>
                      {doc.fileSize > 0 && (
                        <>
                          <span>•</span>
                          <span>Size: {(doc.fileSize / 1024).toFixed(1)} KB</span>
                        </>
                      )}
                    </div>

                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 md:mt-0">
                        {doc.tags.map((tag, i) => (
                          <span key={i} className="bg-zinc-100 text-black px-1.5 py-0.5 border border-zinc-200 text-[9px]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Open document button */}
                  <div className="mt-3">
                    <button
                      onClick={() => onSelectDocument(doc._id)}
                      className="text-[10px] font-mono border border-black px-3 py-1.5 bg-white hover:bg-zinc-100 uppercase cursor-pointer transition-monochrome"
                    >
                      Open Document →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No results */}
        {searched && query && results.length === 0 && !loading && (
          <div className="border border-black p-12 text-center text-zinc-500 bg-white font-mono text-sm uppercase">
            No matching documents found in directory
          </div>
        )}

        {/* Pagination */}
        {searched && pagination.totalPages > 1 && (
          <div className="flex justify-between items-center border border-black p-4 bg-white mt-8 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={!pagination.hasPrev || loading}
              className="px-4 py-2 border border-black text-xs font-mono uppercase hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-white cursor-pointer select-none"
            >
              &lt;&lt; Prev
            </button>
            <span className="text-xs font-mono uppercase">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={!pagination.hasNext || loading}
              className="px-4 py-2 border border-black text-xs font-mono uppercase hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-white cursor-pointer select-none"
            >
              Next &gt;&gt;
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
