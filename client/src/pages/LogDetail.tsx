import { useLog, useExportPdf, useDeleteWorker, useAddWorker, useUpdateWorker, useUpdateLog, useSignLog, type Worker } from "@/hooks/use-logs";
import { Header } from "@/components/Header";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download, Calendar, MapPin, Briefcase, User, Printer, Trash2, Plus, Edit, PenLine } from "lucide-react";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SignatureCanvas from "react-signature-canvas";

export default function LogDetail() {
  const [, params] = useRoute("/logs/:id");
  const id = parseInt(params?.id || "0");
  const { data: log, isLoading, error } = useLog(id);
  const exportPdf = useExportPdf(id);
  const deleteWorker = useDeleteWorker();
  const addWorker = useAddWorker();
  const updateWorker = useUpdateWorker();
  const updateLog = useUpdateLog();
  const signLog = useSignLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [editPrimeContractor, setEditPrimeContractor] = useState("");
  const [editSubcontractor, setEditSubcontractor] = useState("");
  const [editContractNumber, setEditContractNumber] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editAgency, setEditAgency] = useState("");
  const [editProjectNameLocation, setEditProjectNameLocation] = useState("");
  const [editDate, setEditDate] = useState("");
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerClassification, setNewWorkerClassification] = useState("");
  const [newWorkerTimeIn, setNewWorkerTimeIn] = useState("07:00");
  
  const [isEditWorkerOpen, setIsEditWorkerOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editTimeIn, setEditTimeIn] = useState("");
  const [editTimeOut, setEditTimeOut] = useState("");
  const signatureInRef = useRef<SignatureCanvas | null>(null);
  const signatureOutRef = useRef<SignatureCanvas | null>(null);
  
  const [isSignOpen, setIsSignOpen] = useState(false);
  const [signRepName, setSignRepName] = useState("");
  const [signRepTitle, setSignRepTitle] = useState("");
  const contractorSignatureRef = useRef<SignatureCanvas | null>(null);

  const handleAddWorker = async () => {
    if (!newWorkerName.trim() || !newWorkerClassification.trim() || !newWorkerTimeIn.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all worker details.",
        variant: "destructive",
      });
      return;
    }

    try {
      await addWorker.mutateAsync({
        logId: id,
        worker: {
          name: newWorkerName.trim(),
          classification: newWorkerClassification.trim(),
          timeIn: newWorkerTimeIn.trim(),
        },
      });
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path, id] });
      toast({
        title: "Worker added",
        description: `${newWorkerName} has been added to this log.`,
      });
      setIsAddWorkerOpen(false);
      setNewWorkerName("");
      setNewWorkerClassification("");
      setNewWorkerTimeIn("07:00");
    } catch {
      toast({
        title: "Failed to add worker",
        description: "Could not add the worker. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteWorker = async (workerId: number, workerName: string) => {
    try {
      await deleteWorker.mutateAsync(workerId);
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path, id] });
      toast({
        title: "Worker removed",
        description: `${workerName} has been removed from this log.`,
      });
    } catch {
      toast({
        title: "Failed to remove worker",
        description: "Could not remove the worker. Please try again.",
        variant: "destructive",
      });
    }
  };

  const canEditWorkers = log && !log.contractorRepSignature;

  const handleSignLog = async () => {
    if (!signRepName.trim() || !signRepTitle.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide your name and title.",
        variant: "destructive",
      });
      return;
    }

    if (contractorSignatureRef.current?.isEmpty()) {
      toast({
        title: "Signature required",
        description: "Please sign to finalize this log.",
        variant: "destructive",
      });
      return;
    }

    try {
      const signatureData = contractorSignatureRef.current?.toDataURL("image/png");
      await signLog.mutateAsync({
        logId: id,
        data: {
          contractorRepName: signRepName.trim(),
          contractorRepTitle: signRepTitle.trim(),
          contractorRepSignature: signatureData || "",
        },
      });
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path, id] });
      toast({
        title: "Log signed",
        description: "This daily log has been finalized with your signature.",
      });
      setIsSignOpen(false);
      setSignRepName("");
      setSignRepTitle("");
    } catch {
      toast({
        title: "Failed to sign log",
        description: "Could not sign the log. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleOpenEditProject = () => {
    if (!log) return;
    setEditPrimeContractor(log.primeContractor);
    setEditSubcontractor(log.subcontractor || "");
    setEditContractNumber(log.contractNumber);
    setEditAddress(log.address);
    setEditAgency(log.agency);
    setEditProjectNameLocation(log.projectNameLocation);
    setEditDate(log.date);
    setIsEditProjectOpen(true);
  };

  const handleSaveProjectEdit = async () => {
    if (!log) return;
    if (!editPrimeContractor.trim() || !editContractNumber.trim() || !editAddress.trim() || !editAgency.trim() || !editProjectNameLocation.trim() || !editDate.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateLog.mutateAsync({
        logId: id,
        data: {
          primeContractor: editPrimeContractor.trim(),
          subcontractor: editSubcontractor.trim() || null,
          contractNumber: editContractNumber.trim(),
          address: editAddress.trim(),
          agency: editAgency.trim(),
          projectNameLocation: editProjectNameLocation.trim(),
          date: editDate.trim(),
        },
      });
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path, id] });
      toast({
        title: "Project updated",
        description: "Project information has been saved.",
      });
      setIsEditProjectOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the project information.";
      toast({
        title: "Failed to update project",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleEditWorker = (worker: Worker) => {
    setEditingWorker(worker);
    setEditTimeIn(worker.timeIn || "");
    setEditTimeOut(worker.timeOut || "");
    setIsEditWorkerOpen(true);
  };

  const handleSaveWorkerEdit = async () => {
    if (!editingWorker) return;
    
    try {
      const signatureIn = signatureInRef.current?.isEmpty() 
        ? editingWorker.signatureIn 
        : signatureInRef.current?.toDataURL("image/png");
      const signatureOut = signatureOutRef.current?.isEmpty() 
        ? editingWorker.signatureOut 
        : signatureOutRef.current?.toDataURL("image/png");
      
      await updateWorker.mutateAsync({
        workerId: editingWorker.id,
        data: {
          timeIn: editTimeIn || null,
          timeOut: editTimeOut || null,
          signatureIn: signatureIn || null,
          signatureOut: signatureOut || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path, id] });
      toast({
        title: "Worker updated",
        description: `${editingWorker.name}'s information has been saved.`,
      });
      setIsEditWorkerOpen(false);
      setEditingWorker(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the worker information.";
      if (message.includes("signed log")) {
        queryClient.invalidateQueries({ queryKey: [api.logs.get.path, id] });
        toast({
          title: "Log is now locked",
          description: "This log has been signed and can no longer be edited.",
          variant: "destructive",
        });
        setIsEditWorkerOpen(false);
      } else {
        toast({
          title: "Failed to update worker",
          description: message,
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !log) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <h2 className="text-2xl font-bold text-destructive mb-2">Log Not Found</h2>
          <p className="text-muted-foreground">The requested daily log could not be found.</p>
          <Button className="mt-4" onClick={() => window.history.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <main className="container max-w-5xl mx-auto px-4 sm:px-8 py-10">
        
        {/* Actions Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <span className="bg-muted px-2 py-0.5 rounded text-xs font-mono">#{log.contractNumber}</span>
              <span className="text-sm">•</span>
              <span className="text-sm">{format(new Date(log.date + "T12:00:00"), "MMMM d, yyyy")}</span>
            </div>
            <h1 className="text-3xl font-bold">{log.projectNameLocation}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={exportPdf} className="shadow-lg shadow-primary/20">
              <Download className="mr-2 h-4 w-4" /> Export PDF
            </Button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Details */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Project Details */}
            <Card>
              <CardHeader className="pb-4 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" /> Project Information
                </CardTitle>
                {canEditWorkers && (
                  <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" onClick={handleOpenEditProject} data-testid="button-edit-project">
                        <Edit className="h-4 w-4 mr-1" /> Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Edit Project Information</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-2">
                          <Label htmlFor="edit-prime-contractor">Prime Contractor</Label>
                          <Input
                            id="edit-prime-contractor"
                            value={editPrimeContractor}
                            onChange={(e) => setEditPrimeContractor(e.target.value)}
                            data-testid="input-edit-prime-contractor"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-subcontractor">Subcontractor</Label>
                          <Input
                            id="edit-subcontractor"
                            value={editSubcontractor}
                            onChange={(e) => setEditSubcontractor(e.target.value)}
                            data-testid="input-edit-subcontractor"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-contract-number">Contract Number</Label>
                          <Input
                            id="edit-contract-number"
                            value={editContractNumber}
                            onChange={(e) => setEditContractNumber(e.target.value)}
                            data-testid="input-edit-contract-number"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-agency">Agency</Label>
                          <Input
                            id="edit-agency"
                            value={editAgency}
                            onChange={(e) => setEditAgency(e.target.value)}
                            data-testid="input-edit-agency"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-address">Address</Label>
                          <Input
                            id="edit-address"
                            value={editAddress}
                            onChange={(e) => setEditAddress(e.target.value)}
                            data-testid="input-edit-address"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-project-name">Project Name/Location</Label>
                          <Input
                            id="edit-project-name"
                            value={editProjectNameLocation}
                            onChange={(e) => setEditProjectNameLocation(e.target.value)}
                            data-testid="input-edit-project-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-date">Date</Label>
                          <Input
                            id="edit-date"
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            data-testid="input-edit-date"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsEditProjectOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveProjectEdit} disabled={updateLog.isPending} data-testid="button-save-project">
                          {updateLog.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prime Contractor</label>
                  <p className="font-medium text-lg">{log.primeContractor}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subcontractor</label>
                  <p className="font-medium text-lg">{log.subcontractor || "N/A"}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agency</label>
                  <p className="font-medium">{log.agency}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Address</label>
                  <p className="font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground" /> {log.address}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Workers List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" /> Worker Log ({log.workers.length})
                </h3>
                {canEditWorkers && (
                  <Dialog open={isAddWorkerOpen} onOpenChange={setIsAddWorkerOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-worker">
                        <Plus className="h-4 w-4 mr-1" /> Add Worker
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Worker to Log</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="worker-name">Name</Label>
                          <Input
                            id="worker-name"
                            placeholder="Worker name"
                            value={newWorkerName}
                            onChange={(e) => setNewWorkerName(e.target.value)}
                            data-testid="input-worker-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="worker-classification">Classification</Label>
                          <Input
                            id="worker-classification"
                            placeholder="e.g. Electrician, Carpenter"
                            value={newWorkerClassification}
                            onChange={(e) => setNewWorkerClassification(e.target.value)}
                            data-testid="input-worker-classification"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="worker-time-in">Time In</Label>
                          <Input
                            id="worker-time-in"
                            type="time"
                            value={newWorkerTimeIn}
                            onChange={(e) => setNewWorkerTimeIn(e.target.value)}
                            data-testid="input-worker-time-in"
                          />
                        </div>
                        <Button 
                          onClick={handleAddWorker} 
                          className="w-full"
                          disabled={addWorker.isPending}
                          data-testid="button-confirm-add-worker"
                        >
                          {addWorker.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Add Worker
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              
              <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Classification</th>
                        <th className="px-6 py-4">Time In</th>
                        <th className="px-6 py-4">Time Out</th>
                        <th className="px-6 py-4 text-center">Signatures</th>
                        {canEditWorkers && <th className="px-6 py-4 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {log.workers.map((worker) => (
                        <tr key={worker.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-medium">
                            {canEditWorkers ? (
                              <button
                                onClick={() => handleEditWorker(worker)}
                                className="text-left hover:text-primary hover:underline cursor-pointer"
                                data-testid={`link-worker-name-${worker.id}`}
                              >
                                {worker.name}
                              </button>
                            ) : (
                              worker.name
                            )}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">{worker.classification}</td>
                          <td className="px-6 py-4 font-mono">{worker.timeIn}</td>
                          <td className="px-6 py-4 font-mono">{worker.timeOut || "--:--"}</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center gap-4">
                              <div className={`h-8 w-16 border rounded bg-muted/20 flex items-center justify-center ${worker.signatureIn ? 'border-green-500/20 bg-green-500/5' : 'border-dashed'}`}>
                                {worker.signatureIn ? (
                                  <img src={worker.signatureIn} alt="Sig In" className="h-full w-full object-contain p-0.5" />
                                ) : (
                                  <span className="text-[9px] text-muted-foreground/50">NO SIG</span>
                                )}
                              </div>
                              <div className={`h-8 w-16 border rounded bg-muted/20 flex items-center justify-center ${worker.signatureOut ? 'border-green-500/20 bg-green-500/5' : 'border-dashed'}`}>
                                {worker.signatureOut ? (
                                  <img src={worker.signatureOut} alt="Sig Out" className="h-full w-full object-contain p-0.5" />
                                ) : (
                                  <span className="text-[9px] text-muted-foreground/50">NO SIG</span>
                                )}
                              </div>
                            </div>
                          </td>
                          {canEditWorkers && (
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEditWorker(worker)}
                                  data-testid={`button-edit-worker-${worker.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteWorker(worker.id, worker.name)}
                                  disabled={deleteWorker.isPending}
                                  data-testid={`button-delete-worker-${worker.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Verification */}
          <div className="space-y-6">
            <Card className="sticky top-24 border-primary/20 shadow-lg shadow-primary/5">
              <CardHeader className="bg-muted/30 pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  Verification Status
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Contractor Rep</label>
                  <p className="font-bold text-lg">{log.contractorRepName || "Pending"}</p>
                  <p className="text-sm text-muted-foreground">{log.contractorRepTitle}</p>
                </div>
                
                <Separator />
                
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Authorized Signature</label>
                  <div className="bg-background border-2 border-dashed rounded-lg h-24 flex items-center justify-center relative overflow-hidden">
                    {log.contractorRepSignature ? (
                      <img src={log.contractorRepSignature} alt="Signature" className="w-full h-full object-contain p-2" />
                    ) : (
                      <span className="text-muted-foreground/30 text-sm font-mono uppercase">Not Signed</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Date Signed</label>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {log.contractorRepDate ? format(new Date(log.contractorRepDate + "T12:00:00"), "MMMM d, yyyy") : "Pending"}
                  </div>
                </div>

                {canEditWorkers && (
                  <>
                    <Separator />
                    <Button
                      onClick={() => setIsSignOpen(true)}
                      className="w-full"
                      data-testid="button-sign-log"
                    >
                      <PenLine className="h-4 w-4 mr-2" />
                      Sign & Finalize
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            
            {log.contractorRepSignature ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                <p className="flex gap-2">
                  <Printer className="h-4 w-4 shrink-0 mt-0.5" />
                  This log is finalized. Download the PDF to print a physical copy for site records.
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-4 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                <p className="flex gap-2">
                  <PenLine className="h-4 w-4 shrink-0 mt-0.5" />
                  This log is not yet signed. Sign and finalize to lock the log.
                </p>
              </div>
            )}
          </div>
          
        </div>
      </main>

      <Dialog open={isEditWorkerOpen} onOpenChange={(open) => {
        setIsEditWorkerOpen(open);
        if (!open) setEditingWorker(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Worker: {editingWorker?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-time-in">Time In</Label>
                <Input
                  id="edit-time-in"
                  type="time"
                  value={editTimeIn}
                  onChange={(e) => setEditTimeIn(e.target.value)}
                  data-testid="input-edit-time-in"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time-out">Time Out</Label>
                <Input
                  id="edit-time-out"
                  type="time"
                  value={editTimeOut}
                  onChange={(e) => setEditTimeOut(e.target.value)}
                  data-testid="input-edit-time-out"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Sign In Signature</Label>
              <div className="border rounded-lg bg-white">
                {editingWorker?.signatureIn && (
                  <div className="p-2 bg-muted/30 border-b">
                    <img src={editingWorker.signatureIn} alt="Current signature" className="h-12 object-contain" />
                    <span className="text-xs text-muted-foreground">Current signature (draw below to replace)</span>
                  </div>
                )}
                <SignatureCanvas
                  ref={signatureInRef}
                  canvasProps={{
                    className: "w-full h-24",
                    style: { width: "100%", height: "96px" }
                  }}
                  backgroundColor="rgba(0,0,0,0)"
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => signatureInRef.current?.clear()}
                data-testid="button-clear-signature-in"
              >
                Clear
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Sign Out Signature</Label>
              <div className="border rounded-lg bg-white">
                {editingWorker?.signatureOut && (
                  <div className="p-2 bg-muted/30 border-b">
                    <img src={editingWorker.signatureOut} alt="Current signature" className="h-12 object-contain" />
                    <span className="text-xs text-muted-foreground">Current signature (draw below to replace)</span>
                  </div>
                )}
                <SignatureCanvas
                  ref={signatureOutRef}
                  canvasProps={{
                    className: "w-full h-24",
                    style: { width: "100%", height: "96px" }
                  }}
                  backgroundColor="rgba(0,0,0,0)"
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => signatureOutRef.current?.clear()}
                data-testid="button-clear-signature-out"
              >
                Clear
              </Button>
            </div>

            <Button 
              onClick={handleSaveWorkerEdit} 
              className="w-full"
              disabled={updateWorker.isPending}
              data-testid="button-save-worker-edit"
            >
              {updateWorker.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSignOpen} onOpenChange={(open) => {
        setIsSignOpen(open);
        if (!open) {
          setSignRepName("");
          setSignRepTitle("");
          contractorSignatureRef.current?.clear();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign & Finalize Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sign-rep-name">Your Name</Label>
              <Input
                id="sign-rep-name"
                value={signRepName}
                onChange={(e) => setSignRepName(e.target.value)}
                placeholder="Enter your full name"
                data-testid="input-sign-rep-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sign-rep-title">Your Title</Label>
              <Input
                id="sign-rep-title"
                value={signRepTitle}
                onChange={(e) => setSignRepTitle(e.target.value)}
                placeholder="e.g., Site Supervisor"
                data-testid="input-sign-rep-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Your Signature</Label>
              <div className="border rounded-lg bg-white">
                <SignatureCanvas
                  ref={contractorSignatureRef}
                  canvasProps={{
                    className: "w-full h-32",
                    style: { width: "100%", height: "128px" }
                  }}
                  backgroundColor="rgba(0,0,0,0)"
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => contractorSignatureRef.current?.clear()}
                data-testid="button-clear-contractor-signature"
              >
                Clear
              </Button>
            </div>
            <Button 
              onClick={handleSignLog} 
              className="w-full"
              disabled={signLog.isPending}
              data-testid="button-submit-sign"
            >
              {signLog.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <PenLine className="h-4 w-4 mr-2" />
              )}
              Sign & Finalize Log
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
