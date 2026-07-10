import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { debounce } from '../utils/debounce';

export default function Search({ onSelectDocument, currentUser }) {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [myDocs, setMyDocs] = useState(false);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  // Trigger search API call
  const performSearch = async (q, tagList, from, to, myDocsOnly, pageNum) => {
    if (!q || q.trim() === '') {
      setResults([]);
      setPagination({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
      setSearched(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.search.query({
        q: q.trim(),
        tags: tagList ? tagList.trim() : undefined,
        dateFrom: from || undefined,
        dateTo: to || undefined,
        myDocs: myDocsOnly ? 'true' : 'false',
        page: pageNum,
        limit: 10,
      });

      setResults(response.data.results || []);
      setPagination(response.data.pagination || {});
      setSearched(true);
    } catch (err) {
      setError(err.message || 'Error occurred during search.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search helper
  const debouncedSearch = useCallback(
    debounce((q, tagList, from, to, myDocsOnly, pageNum) => {
      performSearch(q, tagList, from, to, myDocsOnly, pageNum);
    }, 400),
    []
  );

  // Trigger debounced search when user-controlled states change
  useEffect(() => {
    debouncedSearch(query, tags, dateFrom, dateTo, myDocs, page);
  }, [query, tags, dateFrom, dateTo, myDocs, page, debouncedSearch]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  };

  const handleResetFilters = () => {
    setTags('');
    setDateFrom('');
    setDateTo('');
    setMyDocs(false);
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

      {/* Main Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1); // Reset page on query edit
            }}
            placeholder="Type search terms here... (e.g. invoice, manual, report)"
            className="w-full text-base md:text-lg border-2 border-black p-4 pr-12 bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
            autoFocus
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs uppercase text-zinc-400 select-none">
            {loading ? 'Searching...' : 'Auto-Search'}
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
              onChange={(e) => {
                setTags(e.target.value);
                setPage(1);
              }}
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
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
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
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full border border-black p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black focus-ring-monochrome font-mono"
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center">
          <label className="flex items-center text-xs uppercase font-mono tracking-wide text-zinc-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={myDocs}
              onChange={(e) => {
                setMyDocs(e.target.checked);
                setPage(1);
              }}
              className="mr-2 accent-black w-4 h-4 border border-black focus:outline-none cursor-pointer"
            />
            Limit search to my documents only
          </label>
        </div>
      </div>

      {/* Results View */}
      <div className="space-y-6">
        
        {/* Messages */}
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

        {/* Loading Spinner / Skeleton */}
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
            <span>Found {pagination.total} matching documents</span>
            <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
          </div>
        )}

        {/* Search Results list */}
        {searched && results.length > 0 && (
          <div className="space-y-4">
            {results.map((doc) => (
              <div
                key={doc._id}
                onClick={() => onSelectDocument(doc._id)}
                className="border border-black p-5 bg-white hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-monochrome cursor-pointer group"
              >
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-2">
                  <h3 className="text-md font-bold tracking-tight group-hover:underline text-black">
                    {doc.title}
                  </h3>
                  
                  {/* Score Badges */}
                  <div className="flex items-center gap-2 self-start">
                    <span className="text-[10px] font-mono bg-black text-white px-2 py-0.5 uppercase">
                      Score: {doc.relevanceScore}
                    </span>
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

                {/* Snippet (Securely outputted text excerpt with no innerHTML assignment) */}
                {doc.snippet && (
                  <p className="text-xs text-zinc-600 leading-relaxed font-mono bg-zinc-50 p-2.5 border-l-2 border-black my-3">
                    {doc.snippet}
                  </p>
                )}

                {doc.summary && (
                  <p className="text-xs text-zinc-500 mb-3 italic">
                    {doc.summary}
                  </p>
                )}

                {/* Metadata details */}
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

                  {/* Tags */}
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
              </div>
            ))}
          </div>
        )}

        {/* Search Completed but 0 matches */}
        {searched && query && results.length === 0 && !loading && (
          <div className="border border-black p-12 text-center text-zinc-500 bg-white font-mono text-sm uppercase">
            No matching documents found in directory
          </div>
        )}

        {/* Pagination Section */}
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
