"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, Download, Search, Filter, File } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "contract", label: "Contract" },
  { value: "invoice", label: "Invoice" },
  { value: "permit", label: "Permit" },
  { value: "id_document", label: "ID Document" },
  { value: "confirmation_of_transfer", label: "Payment Confirmation" },
  { value: "contract_drawings", label: "Contract Drawings" },
  { value: "working_drawings", label: "Working Drawings" },
  { value: "other", label: "Other" },
];

const categoryColors: Record<string, string> = {
  contract: "bg-amber-50 text-amber-700",
  invoice: "bg-blue-50 text-blue-700",
  permit: "bg-green-50 text-green-700",
  id_document: "bg-purple-50 text-purple-700",
  confirmation_of_transfer: "bg-emerald-50 text-emerald-700",
  contract_drawings: "bg-cyan-50 text-cyan-700",
  working_drawings: "bg-indigo-50 text-indigo-700",
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function PortalDocuments() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [contactId, setContactId] = useState<string | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("other");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: contact } = await supabase.from("contacts").select("id").eq("linked_user_id", user.id).single();
      if (!contact) return;
      setContactId(contact.id);
      const { data: projects } = await supabase.from("projects").select("id").eq("client_id", contact.id);
      setProjectIds((projects || []).map((p: any) => p.id));
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["portal-documents", contactId, projectIds],
    queryFn: async () => {
      if (!contactId) return [];
      // Fetch docs for contact OR their projects
      let query = supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (projectIds.length > 0) {
        query = query.or(`contact_id.eq.${contactId},project_id.in.(${projectIds.join(",")})`);
      } else {
        query = query.eq("contact_id", contactId);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!contactId,
  });

  const filtered = documents.filter((doc: any) => {
    const matchSearch = !search || doc.name?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || doc.category === category;
    return matchSearch && matchCategory;
  });

  const handleUpload = async () => {
    if (!uploadFile || !contactId) return;
    setUploading(true);
    try {
      const path = `portal/${Date.now()}_${uploadFile.name}`;
      const { data: storageData, error: storageError } = await supabase.storage.from("documents").upload(path, uploadFile);
      if (storageError) throw storageError;

      const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(storageData.path);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("documents").insert({
        name: uploadFile.name,
        file_url: publicUrl,
        file_type: uploadFile.type,
        file_size: uploadFile.size,
        contact_id: contactId,
        project_id: projectIds[0] || null,
        uploaded_by: user?.id || null,
        category: uploadCategory,
      });

      queryClient.invalidateQueries({ queryKey: ["portal-documents"] });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadCategory("other");
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-black tracking-tight">Documents</h1>
        <Button className="bg-[#957B60] hover:bg-[#7a6550] text-white gap-2" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" /> Upload Document
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2 text-neutral-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-400">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No documents found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc: any) => (
            <Card key={doc.id} className="border border-neutral-200 hover:border-neutral-300 transition-colors">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                  <File className="h-5 w-5 text-neutral-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-neutral-800 truncate">{doc.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {doc.category && (
                      <Badge variant="secondary" className={cn("text-xs", categoryColors[doc.category] || "bg-neutral-100 text-neutral-600")}>
                        {doc.category.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {doc.file_size && <span className="text-xs text-neutral-400">{formatFileSize(doc.file_size)}</span>}
                    <span className="text-xs text-neutral-400">{format(new Date(doc.created_at), "d MMM yyyy")}</span>
                  </div>
                </div>
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>File</Label>
              <Input type="file" className="mt-1" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="id_document">ID Document</SelectItem>
                  <SelectItem value="confirmation_of_transfer">Payment Confirmation</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button className="bg-[#957B60] hover:bg-[#7a6550] text-white" onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
