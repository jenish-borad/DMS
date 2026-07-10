import { useState, useEffect } from 'react';
import { api } from '../api';

export default function DocumentList({ onSelectDocument, onOpenUpload, refreshTrigger }) {
  const [documents, setDocuments] = useState([]);
  const [page, setPage] = useState(1);
  const [tagFilter, setTagFilter] = useState('');
  const [publicFilter, setPublicFilter] = useState(''); // 'true', 'false', or '' (all)
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

  // Custom Delete Confirmation Modal State (No native confirm window used)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const isPublicVal = publicFilter === 'true' ? true : publicFilter === 'false' ? false : undefined;
      const response = await api.documents.list({
        page,
        limit: 10,
        tags: tagFilter.trim() || undefined,
        isPublic: isPublicVal,
      });

      setDocuments(response.data.documents || []);
      setPagination(response.data.pagination || {});
    } catch (err) {
      setError(err.message || 'Failed to fetch documents.');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when dependencies change
  useEffect(() => {
    fetchDocuments();
  }, [page, tagFilter, publicFilter, refreshTrigger]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  };

  // Initiate custom deletion prompt
  const promptDelete = (id, title) => {
    setDeleteConfirmId(id);
    setDeleteConfirmTitle(title);
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
    setDeleteConfirmTitle('');
  };

  // Execute deletion
  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    setError('');

    try {
      await api.documents.delete(deleteConfirmId);
      // Clean up modal states
      setDeleteConfirmId(null);
      setDeleteConfirmTitle('');
      // If we deleted the last item on the page, go back a page if possible
      if (documents.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchDocuments();
      }
    } catch (err) {
      setError(err.message || 'Failed to delete the document.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      
      {/* List Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-black pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tighter uppercase font-mono">
            Document Repository
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-1 uppercase tracking-wider">
            Manage your personal documents, access levels, and tags
          </p>
        </div>
        <button
          onClick={onOpenUpload}
          className="bg-black text-white hover:bg-zinc-800 border border-black font-mono text-xs uppercase px-4 py-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-monochrome cursor-pointer"
        >
          + Upload / Create New
        </button>
      </div>

      {/* Filter Section */}
      <div className="bg-white border border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Tag Filter */}
          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase font-mono font-semibold text-zinc-600 mb-1">
              Filter by Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => {
                setTagFilter(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. invoice, guide"
              className="w-full border border-black p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black focus-ring-monochrome font-mono"
            />
          </div>

          {/* Public/Private Access Level */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-zinc-600 mb-1">
              Access Scope
            </label>
            <select
              value={publicFilter}
              onChange={(e) => {
                setPublicFilter(e.target.value);
                setPage(1);
              }}
              className="w-full border border-black p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black focus-ring-monochrome font-mono cursor-pointer"
            >
              <option value="">All Documents</option>
              <option value="true">Public Only</option>
              <option value="false">Private Only</option>
            </select>
          </div>

        </div>
      </div>

      {/* Table/Card List container */}
      <div className="space-y-4">
        {error && (
          <div className="p-4 bg-black text-white text-xs font-mono border border-black">
            [ERROR] {error}
          </div>
        )}

        {loading && documents.length === 0 ? (
          <div className="border border-black p-12 text-center text-zinc-500 bg-white font-mono text-sm uppercase animate-pulse">
            Loading repository files...
          </div>
        ) : documents.length === 0 ? (
          <div className="border border-dashed border-zinc-300 p-12 text-center text-zinc-400 bg-white font-mono text-sm uppercase">
            No documents found in repository. Click &apos;Upload / Create New&apos; to add one.
          </div>
        ) : (
          <div className="border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-black text-white font-mono text-xs uppercase tracking-wider border-b border-black">
                  <th className="p-4 font-semibold">Title</th>
                  <th className="p-4 font-semibold">Tags</th>
                  <th className="p-4 font-semibold">Scope</th>
                  <th className="p-4 font-semibold">Uploaded At</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {documents.map((doc) => (
                  <tr key={doc._id} className="hover:bg-zinc-50 transition-monochrome">
                    <td className="p-4 font-semibold text-black">
                      <div className="font-mono text-xs text-zinc-400 font-normal mb-0.5">
                        {doc.originalName || 'Plain Text'}
                      </div>
                      <button
                        onClick={() => onSelectDocument(doc._id)}
                        className="text-left font-bold hover:underline cursor-pointer"
                      >
                        {doc.title}
                      </button>
                      {doc.summary && (
                        <div className="text-xs text-zinc-500 font-normal line-clamp-1 mt-0.5 max-w-md">
                          {doc.summary}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {doc.tags && doc.tags.length > 0 ? (
                          doc.tags.map((tag, i) => (
                            <span key={i} className="bg-zinc-100 text-zinc-800 text-[10px] px-1.5 py-0.5 border border-zinc-200 font-mono">
                              #{tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-zinc-300 text-xs italic font-mono">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {doc.isPublic ? (
                        <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 border border-zinc-300 rounded-sm">
                          PUBLIC
                        </span>
                      ) : (
                        <span className="bg-black text-white px-2 py-0.5 rounded-sm">
                          PRIVATE
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-xs text-zinc-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => onSelectDocument(doc._id)}
                        className="border border-black px-2.5 py-1 text-xs font-mono uppercase bg-white hover:bg-zinc-100 cursor-pointer transition-monochrome"
                      >
                        View / Edit
                      </button>
                      <button
                        onClick={() => promptDelete(doc._id, doc.title)}
                        className="bg-black text-white border border-black px-2.5 py-1 text-xs font-mono uppercase hover:bg-zinc-800 cursor-pointer transition-monochrome"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && pagination.totalPages > 1 && (
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

      {/* Custom React Delete Confirmation Modal (Required: no native confirm dialogue window) */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border-2 border-black max-w-md w-full p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-lg font-bold font-mono uppercase tracking-tight border-b-2 border-black pb-2 mb-4">
              Confirm Document Destruction
            </h3>
            
            <p className="text-sm text-zinc-600 mb-6 font-mono leading-relaxed">
              Are you sure you want to permanently delete the document <span className="font-bold text-black">&ldquo;{deleteConfirmTitle}&rdquo;</span>? This action will unlink stored files and cannot be undone.
            </p>

            <div className="flex justify-end gap-3 font-mono text-xs">
              <button
                onClick={cancelDelete}
                disabled={deleting}
                className="border border-black px-4 py-2.5 uppercase bg-white hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
              >
                Abort
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="bg-black text-white border border-black px-4 py-2.5 uppercase hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Destroying...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
