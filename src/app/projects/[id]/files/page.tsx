'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  AlertCircle,
  Plus,
  MoreVertical,
  Trash2,
  Download,
  FileText,
  Image,
  File,
  Upload,
  X,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectSidebar } from '@/components/layout/project-sidebar';
import type { ProjectFile } from '@/types/api';
import { FileViewer } from '@/components/files/file-viewer';
import { STORAGE_BUCKETS } from '@/lib/storage/storage-constants';

const FILE_TYPE_ICONS: Record<string, any> = {
  'application/pdf': FileText,
  'image/': Image,
  'text/': FileText,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  'application/pdf': 'bg-red-100 text-red-800',
  'image/': 'bg-blue-100 text-blue-800',
  'text/': 'bg-green-100 text-green-800',
  'audio/': 'bg-purple-100 text-purple-800',
  'video/': 'bg-orange-100 text-orange-800',
};

function getFileIcon(mimeType: string): any {
  for (const [prefix, Icon] of Object.entries(FILE_TYPE_ICONS)) {
    if (mimeType.startsWith(prefix)) {
      return Icon;
    }
  }
  return File;
}

function getFileColor(mimeType: string): string {
  for (const [prefix, color] of Object.entries(FILE_TYPE_COLORS)) {
    if (mimeType.startsWith(prefix)) {
      return color;
    }
  }
  return 'bg-gray-100 text-gray-800';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ProjectFilesPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles();
  }, [projectId]);

  const fetchFiles = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (fileList: FileList) => {
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      const file = fileList[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${projectId}/${Date.now()}_${file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKETS.FILES)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { error: dbError } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          name: file.name,
          storage_path: fileName,
          size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: user.id,
        });

      if (dbError) throw dbError;

      await fetchFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDownload = async (file: ProjectFile) => {
    try {
      const supabase = createClient();
      if (!file.storage_path) return;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.FILES)
        .download(file.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      const supabase = createClient();
      const file = files.find(f => f.id === fileId);

      if (file && file.storage_path) {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKETS.FILES)
          .remove([file.storage_path]);

        if (storageError) throw storageError;
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('project_files')
        .delete()
        .eq('id', fileId);

      if (dbError) throw dbError;

      await fetchFiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading files...</p>
        </div>
      </div>
    );
  }

  return (
    <ProjectSidebar projectId={projectId}>
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Files</h1>
            <p className="text-muted-foreground">Project documents and assets</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            accept=".txt,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.mp4,.webm"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Uploading...</span>
              <span className="text-sm text-muted-foreground">{Math.round(uploadProgress)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`mb-6 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag and drop files here, or click the upload button
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Supported: .txt, .md, .pdf, images, audio, video
          </p>
        </div>

        {/* Files List */}
        {files.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No files yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Upload project documents and assets
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {files.map(file => {
              const Icon = getFileIcon(file.mime_type || '');
              const colorClass = getFileColor(file.mime_type || '');

              return (
                <Card key={file.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Preview ${file.name}`}
                        onClick={() => setPreviewFile(file)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPreviewFile(file);
                          }
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className={`p-2 rounded-lg ${colorClass}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-medium truncate">
                            {file.name}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {formatFileSize(file.size_bytes || 0)}
                          </CardDescription>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDownload(file)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(file.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{file.mime_type}</span>
                      <span>{new Date(file.created_at).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <FileViewer
        file={previewFile}
        files={files}
        onClose={() => setPreviewFile(null)}
        onNavigate={setPreviewFile}
      />
    </ProjectSidebar>
  );
}
