import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { splitWithHighlights } from '../utils/highlightText';

export default function DocumentModal({ documentId, currentUser, onClose, onUpdateSuccess, searchTerms = [], matchMode = 'whole' }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Search highlight navigation state
  const [currentHighlight, setCurrentHighlight] = useState(0);
  const contentRef = useRef(null);

  useEffect(() => {
    const fetchDocDetails = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.documents.get(documentId);
        const data = response.data;
        setDoc(data);
        
        // Populate edit fields
        setTitle(data.title || '');
        setSummary(data.summary || '');
        setTags(data.tags ? data.tags.join(', ') : '');
        setIsPublic(data.isPublic || false);
        setContent(data.content || '');
      } catch (err) {
        setError(err.message || 'Failed to load document details.');
      } finally {
        setLoading(false);
      }
    };

    if (documentId) {
      fetchDocDetails();
    }
  }, [documentId]);

  // Determine if the current user is the owner of the document
  const isOwner = doc && currentUser && doc.owner === currentUser._id;

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const tagArray = tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      const updates = {
        title: title.trim(),
        summary: summary.trim(),
        isPublic,
        tags: tagArray,
        content: content,
      };

      const response = await api.documents.update(documentId, updates);
      setDoc(response.data);
      setIsEditing(false);
      onUpdateSuccess();
    } catch (err) {
      setError(err.message || 'Failed to update document.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white border-2 border-black max-w-3xl w-full p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] my-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b-2 border-black pb-3 mb-6">
          <h3 className="text-xl font-bold font-mono uppercase tracking-tight">
            Document Terminal
          </h3>
          <button
            onClick={onClose}
            className="text-black hover:bg-zinc-100 border border-black font-mono text-xs uppercase px-2 py-1 cursor-pointer select-none"
          >
            Close
          </button>
        </div>

        {/* Status Error Banners */}
        {error && (
          <div className="mb-6 p-3 bg-black text-white text-xs font-mono border border-black">
            [ERROR] {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-zinc-500 font-mono text-xs uppercase">
            Loading document streams...
          </div>
        ) : !doc ? (
          <div className="p-12 text-center text-zinc-400 font-mono text-xs uppercase">
            Document record not available
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Top metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-zinc-50 border border-black font-mono text-[10px] uppercase text-zinc-500">
              <div>
                <span className="block font-bold text-zinc-700">Filename</span>
                <span className="truncate block font-semibold text-black">{doc.originalName || 'Text Area Input'}</span>
              </div>
              <div>
                <span className="block font-bold text-zinc-700">Access Scope</span>
                <span className="block font-semibold text-black">{doc.isPublic ? 'PUBLIC' : 'PRIVATE'}</span>
              </div>
              <div>
                <span className="block font-bold text-zinc-700">Uploaded At</span>
                <span className="block font-semibold text-black">{new Date(doc.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="block font-bold text-zinc-700">File Size</span>
                <span className="block font-semibold text-black">{(doc.fileSize / 1024).toFixed(1)} KB</span>
              </div>
            </div>

            {/* Read/Write Controller Tab (Only visible if owner) */}
            {isOwner && !isEditing && (
              <div className="flex justify-end">
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-black text-white hover:bg-zinc-800 border border-black font-mono text-xs uppercase px-4 py-2"
                >
                  Edit Document Parameters
                </button>
              </div>
            )}

            {isEditing ? (
              /* Edit Metadata and content Form */
              <form onSubmit={handleUpdate} className="space-y-5">
                <div>
                  <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                    Document Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border border-black p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                    Extracted/Stored Text Content
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={8}
                    className="w-full border border-black p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                    Summary
                  </label>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={2}
                    className="w-full border border-black p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                    Tags (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="finance, invoice, 2026"
                    className="w-full border border-black p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center text-xs uppercase font-mono tracking-wide text-zinc-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="mr-2 accent-black w-4 h-4 border border-black focus:outline-none cursor-pointer"
                    />
                    Make this document Publicly viewable
                  </label>
                </div>

                {/* Edit Form Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-black font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setError('');
                    }}
                    disabled={saving}
                    className="border border-black px-4 py-2 uppercase bg-white hover:bg-zinc-100 cursor-pointer"
                  >
                    Abort
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-black text-white border border-black px-4 py-2 uppercase hover:bg-zinc-800 cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Updates'}
                  </button>
                </div>
              </form>
            ) : (
              /* Read Only Viewer Mode */
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-black font-mono uppercase">
                    {doc.title}
                  </h2>
                  
                  {doc.tags && doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {doc.tags.map((tag, i) => (
                        <span key={i} className="bg-zinc-100 text-black border border-zinc-200 text-[10px] px-2 py-0.5 font-mono">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {doc.summary && (
                  <div className="p-4 bg-zinc-50 border-l-2 border-black">
                    <h4 className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 font-bold mb-1">
                      Abstract/Summary
                    </h4>
                    <p className="text-xs text-zinc-700 leading-relaxed font-mono">
                      {doc.summary}
                    </p>
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 font-bold mb-2">
                    Extracted Text Layer
                  </h4>
                {doc.content ? (
                    <div ref={contentRef}>
                      {/* Search highlight nav bar — only shown when opened from search */}
                      {searchTerms.length > 0 && (() => {
                        const segments = splitWithHighlights(doc.content, searchTerms, matchMode);
                        const matchCount = segments.filter(s => s.isMatch).length;
                        return matchCount > 0 ? (
                          <div className="flex items-center gap-3 mb-2 p-2 bg-yellow-50 border border-yellow-300 font-mono text-[10px] uppercase">
                            <span className="text-zinc-600">
                              {matchCount} match{matchCount !== 1 ? 'es' : ''} for &ldquo;{searchTerms.join(' ')}&rdquo;
                            </span>
                            <button
                              onClick={() => {
                                const prev = Math.max(0, currentHighlight - 1);
                                setCurrentHighlight(prev);
                                const el = document.getElementById(`doc-match-${prev}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              disabled={currentHighlight === 0}
                              className="border border-black px-2 py-0.5 bg-white hover:bg-zinc-100 disabled:opacity-30 cursor-pointer"
                            >
                              ← Prev
                            </button>
                            <span className="text-zinc-500">{currentHighlight + 1} / {matchCount}</span>
                            <button
                              onClick={() => {
                                const next = Math.min(matchCount - 1, currentHighlight + 1);
                                setCurrentHighlight(next);
                                const el = document.getElementById(`doc-match-${next}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              disabled={currentHighlight >= matchCount - 1}
                              className="border border-black px-2 py-0.5 bg-white hover:bg-zinc-100 disabled:opacity-30 cursor-pointer"
                            >
                              Next →
                            </button>
                          </div>
                        ) : null;
                      })()}

                      {/* Full document content with highlighted terms */}
                      <div className="border border-black p-4 bg-white font-mono text-xs max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {searchTerms.length > 0 ? (() => {
                          const segments = splitWithHighlights(doc.content, searchTerms, matchMode);
                          let matchIdx = 0;
                          return segments.map((seg, i) => {
                            if (seg.isMatch) {
                              const idx = matchIdx;
                              matchIdx++;
                              const isActive = idx === currentHighlight;
                              return (
                                <mark
                                  key={i}
                                  id={`doc-match-${idx}`}
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
                        })() : (
                          /* No search terms — plain secure text output */
                          doc.content
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-zinc-300 p-8 text-center text-zinc-400 font-mono text-xs uppercase bg-zinc-50">
                      This document has no extracted text content.
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
