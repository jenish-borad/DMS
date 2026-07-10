import { useState, useRef } from 'react';
import { api } from '../api';

export default function UploadModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  
  // Creation Mode: 'file' or 'text'
  const [mode, setMode] = useState('file');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      // Basic size validation client-side (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File exceeds 10MB size limit.');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setFile(selectedFile);
      setError('');

      // Auto-populate title from filename if title is empty
      if (!title) {
        const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
        setTitle(baseName);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Document title is required.');
      return;
    }

    if (mode === 'file' && !file) {
      setError('Please select a file to upload.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Split tags by comma, trim them, and filter empty strings
      const tagArray = tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      let payload;

      if (mode === 'file') {
        // FormData is required for file uploads
        const formData = new FormData();
        formData.append('title', title.trim());
        formData.append('summary', summary.trim());
        formData.append('isPublic', String(isPublic));
        formData.append('file', file);
        
        // Append tags
        tagArray.forEach(tag => {
          formData.append('tags', tag);
        });

        payload = formData;
      } else {
        // Plain text documents can be sent via JSON payload
        payload = {
          title: title.trim(),
          summary: summary.trim(),
          isPublic,
          tags: tagArray,
          content,
        };
      }

      await api.documents.create(payload);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to create document.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white border-2 border-black max-w-2xl w-full p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] my-8 animate-fade-in">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b-2 border-black pb-3 mb-6">
          <h3 className="text-xl font-bold font-mono uppercase tracking-tight">
            Ingest Document
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

        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Document Type Selector Tabs */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-zinc-500 mb-2">
              Ingestion Method
            </label>
            <div className="flex border border-black font-mono text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode('file');
                  setError('');
                }}
                className={`flex-1 p-2 text-center uppercase border-r border-black cursor-pointer transition-monochrome select-none ${
                  mode === 'file' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                }`}
              >
                File Upload (.txt, .md, .docx)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('text');
                  setError('');
                }}
                className={`flex-1 p-2 text-center uppercase cursor-pointer transition-monochrome select-none ${
                  mode === 'text' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                }`}
              >
                Plain Text Editor
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
              Document Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title"
              className="w-full border border-black p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
              required
            />
          </div>

          {/* Conditional Input based on mode */}
          {mode === 'file' ? (
            <div>
              <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                Select File (Max 10MB)
              </label>
              <div className="border border-black p-4 bg-zinc-50 font-mono text-xs flex flex-col items-center justify-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".txt,.md,.docx"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-black px-4 py-2 bg-white hover:bg-zinc-100 uppercase cursor-pointer"
                >
                  Browse local files
                </button>
                <div className="text-zinc-500 font-semibold uppercase text-[10px]">
                  {file ? `File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)` : 'No file chosen'}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                Document Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type or paste document content here..."
                rows={6}
                className="w-full border border-black p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
              />
            </div>
          )}

          {/* Summary */}
          <div>
            <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
              Brief Summary (Optional)
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short abstract summarizing this document..."
              rows={2}
              className="w-full border border-black p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
              Tags (Comma Separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. manual, logistics, 2026"
              className="w-full border border-black p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome font-mono"
            />
          </div>

          {/* Public Access Checkbox */}
          <div className="pt-2 border-t border-zinc-100 flex items-center">
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

          {/* Submit Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-black font-mono text-xs">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="border border-black px-5 py-3 uppercase bg-white hover:bg-zinc-100 cursor-pointer disabled:opacity-50 select-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white border border-black px-5 py-3 uppercase hover:bg-zinc-800 cursor-pointer disabled:opacity-50 select-none"
            >
              {loading ? 'Ingesting...' : 'Ingest Document'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
