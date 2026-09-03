'use client';

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { Badge } from "@/components/ui/badge";
import { Clipboard, AlertCircle, Upload, X } from "lucide-react";
import { useStaffMembers } from "../hooks/useStaffMembers";
import { useOperationalPosts } from "../hooks/useOperationalPosts";
import {
  penaltyFormSchema,
  PenaltyFormData,
  SOURCES_OF_INFORMATION,
  OFFENSE_TYPES,
  OFFENSES_BY_TYPE,
  OffenseType,
} from "../schemas/penaltySchema";
import { getDefaultWeight } from "../utils/penaltyPoints";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm',
  'application/pdf',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

interface PenaltyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PenaltyFormData) => void;
  editData: any | null;
}

export function PenaltyForm({ isOpen, onClose, onSubmit, editData }: PenaltyFormProps) {
  const { toast } = useToastWithSound();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { staffMembers, isLoading: isLoadingStaff, error: staffError } = useStaffMembers();
  const { posts, isLoading: isLoadingPosts, error: postsError } = useOperationalPosts();

  const [formData, setFormData] = useState({
    staff_id: "",
    staff_name: "",
    post_id: "",
    post_name: "",
    violation_date: new Date().toISOString().split('T')[0],
    source_of_information: "" as string,
    offense_type: "" as string,
    offense: "" as string,
    weight: 1,
    description: "",
    evidence_url: null as string | null,
    related_entity_id: null as string | null,
    related_entity_type: null as string | null,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (editData) {
      if (editData.id) {
        setFormData({
          staff_id: editData.staff_id || "",
          staff_name: editData.staff_name || "",
          post_id: editData.post_id || "",
          post_name: editData.post_name || "",
          violation_date: editData.violation_date || new Date().toISOString().split('T')[0],
          source_of_information: editData.source_of_information || "",
          offense_type: editData.offense_type || "",
          offense: editData.offense || "",
          weight: editData.weight || 1,
          description: editData.description || "",
          evidence_url: editData.evidence_url || null,
          related_entity_id: editData.related_entity_id || null,
          related_entity_type: editData.related_entity_type || null,
        });
      } else if (editData.related_entity_id) {
        setFormData({
          staff_id: "",
          staff_name: "",
          post_id: "",
          post_name: "",
          violation_date: new Date().toISOString().split('T')[0],
          source_of_information: "Patrol",
          offense_type: "",
          offense: "",
          weight: 1,
          description: "",
          evidence_url: null,
          related_entity_id: editData.related_entity_id,
          related_entity_type: editData.related_entity_type || "patrol",
        });
      }
    } else {
      setFormData({
        staff_id: "",
        staff_name: "",
        post_id: "",
        post_name: "",
        violation_date: new Date().toISOString().split('T')[0],
        source_of_information: "",
        offense_type: "",
        offense: "",
        weight: 1,
        description: "",
        evidence_url: null,
        related_entity_id: null,
        related_entity_type: null,
      });
    }
    setSelectedFile(null);
    setFileError(null);
  }, [editData]);

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleOffenseTypeChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      offense_type: value,
      offense: "", // Reset offense when type changes
      weight: 1,
    }));
  };

  const handleOffenseChange = (value: string) => {
    const weight = getDefaultWeight(value);
    setFormData(prev => ({
      ...prev,
      offense: value,
      weight,
    }));
  };

  const handleStaffChange = (staffId: string) => {
    const selectedStaff = staffMembers.find(s => s.id === staffId);
    if (selectedStaff) {
      setFormData(prev => ({
        ...prev,
        staff_id: selectedStaff.id,
        staff_name: selectedStaff.name,
      }));
    }
  };

  const handlePostChange = (postId: string) => {
    const selectedPost = posts.find(p => p.id === postId);
    if (selectedPost) {
      setFormData(prev => ({
        ...prev,
        post_id: selectedPost.id,
        post_name: selectedPost.post_name,
      }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setFileError("Unsupported file type. Allowed: images, audio, video, PDF.");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError("File exceeds 20MB limit.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadEvidence = async (file: File): Promise<string> => {
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    formDataUpload.append('folder', 'penalties');

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formDataUpload,
    });

    if (!response.ok) {
      throw new Error('Failed to upload evidence file');
    }

    const result = await response.json();
    return result.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dataToValidate = {
      staff_id: formData.staff_id,
      staff_name: formData.staff_name,
      post_id: formData.post_id,
      post_name: formData.post_name,
      violation_date: formData.violation_date,
      source_of_information: formData.source_of_information,
      offense_type: formData.offense_type,
      offense: formData.offense,
      weight: formData.weight,
      description: formData.description,
      evidence_url: formData.evidence_url,
      related_entity_id: formData.related_entity_id || null,
      related_entity_type: formData.related_entity_type || null,
    };

    const validationResult = penaltyFormSchema.safeParse(dataToValidate);

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map(err => err.message).join(', ');
      toast({
        title: "Validation Error",
        description: errors,
        variant: "destructive",
      });
      return;
    }

    // Upload evidence if file selected
    let evidenceUrl = formData.evidence_url;
    if (selectedFile) {
      try {
        setIsUploading(true);
        evidenceUrl = await uploadEvidence(selectedFile);
      } catch {
        toast({
          title: "Upload Error",
          description: "Failed to upload evidence file. Please try again.",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    onSubmit({ ...validationResult.data, evidence_url: evidenceUrl });
  };

  const getFormTitle = () => {
    if (editData?.id) return "Edit Penalty Record";
    if (formData.source_of_information === 'Patrol') return "Record Penalty from Patrol";
    return "Record New Penalty";
  };

  const getFormDescription = () => {
    if (editData?.id) return "Update the penalty record details below.";
    if (formData.source_of_information === 'Patrol') return "Document a violation found during patrol inspection.";
    return "Document a new staff violation or penalty.";
  };

  const availableOffenses = formData.offense_type
    ? OFFENSES_BY_TYPE[formData.offense_type as OffenseType] ?? []
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{getFormTitle()}</DialogTitle>
          <DialogDescription>{getFormDescription()}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formData.related_entity_id && formData.source_of_information === 'Patrol' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md p-3 flex items-center gap-2">
              <Clipboard className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Related to Patrol</p>
                <p className="text-xs text-muted-foreground">Linked to patrol record {formData.related_entity_id}</p>
              </div>
              <Badge className="ml-auto">Patrol</Badge>
            </div>
          )}

          {staffError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Failed to load staff members: {staffError.message}</AlertDescription>
            </Alert>
          )}

          {postsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Failed to load operational posts: {postsError.message}</AlertDescription>
            </Alert>
          )}

          {/* Row 1: Staff + Post */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Staff Member*</Label>
              <Select value={formData.staff_id} onValueChange={handleStaffChange} disabled={isLoadingStaff || !!staffError}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingStaff ? "Loading..." : "Select Staff"} />
                </SelectTrigger>
                <SelectContent>
                  {staffMembers.map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Post Location*</Label>
              <Select value={formData.post_id} onValueChange={handlePostChange} disabled={isLoadingPosts || !!postsError}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingPosts ? "Loading..." : "Select Post"} />
                </SelectTrigger>
                <SelectContent>
                  {posts.map(post => (
                    <SelectItem key={post.id} value={post.id}>{post.post_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Source of Information + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Source of Information*</Label>
              <Select value={formData.source_of_information} onValueChange={(v) => handleChange("source_of_information", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES_OF_INFORMATION.map(source => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date of Violation*</Label>
              <Input
                type="date"
                value={formData.violation_date}
                onChange={(e) => handleChange("violation_date", e.target.value)}
              />
            </div>
          </div>

          {/* Row 3: Offense Type + What Offense */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type of Offense*</Label>
              <Select value={formData.offense_type} onValueChange={handleOffenseTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {OFFENSE_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>What Offense*</Label>
              <Select
                value={formData.offense}
                onValueChange={handleOffenseChange}
                disabled={!formData.offense_type}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.offense_type ? "Select Offense" : "Select type first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableOffenses.map(offense => (
                    <SelectItem key={offense} value={offense}>{offense}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 4: Weight */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Weight of Offense (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={formData.weight}
                onChange={(e) => handleChange("weight", parseInt(e.target.value) || 1)}
                title="Severity weight from 1 (lowest) to 5 (highest)"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description*</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Provide details of the violation"
              rows={3}
            />
          </div>

          {/* Evidence Upload */}
          <div className="space-y-2">
            <Label>Upload Evidence (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*,video/*,.pdf"
                onChange={handleFileChange}
                className="flex-1"
              />
              {selectedFile && (
                <Button type="button" variant="ghost" size="icon" onClick={removeFile}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {selectedFile && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Upload className="h-3 w-3" />
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)
              </p>
            )}
            {fileError && (
              <p className="text-xs text-red-500">{fileError}</p>
            )}
            {formData.evidence_url && !selectedFile && (
              <p className="text-xs text-muted-foreground">Existing evidence attached</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? "Uploading..." : editData?.id ? "Update Record" : "Save Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
