import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createLogSchema, type CreateLogRequest } from "@shared/schema";
import { useCreateLog } from "@/hooks/use-logs";
import { Header } from "@/components/Header";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SignaturePad } from "@/components/SignaturePad";
import { SignatureCell } from "@/components/WorkerCells";
import { Loader2, Plus, Trash2, Save, User, Clock, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CreateLog() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createLog = useCreateLog();

  const form = useForm<CreateLogRequest>({
    resolver: zodResolver(createLogSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      workers: [
        { name: "", classification: "", timeIn: "07:00", timeOut: "15:30" }
      ],
      primeContractor: "",
      contractNumber: "",
      address: "",
      agency: "",
      projectNameLocation: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "workers",
  });

  const onSubmit = (data: CreateLogRequest) => {
    createLog.mutate(data, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Daily log created successfully",
        });
        setLocation("/");
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <main className="container max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">New Daily Log</h1>
          <p className="text-muted-foreground">Fill out the project details and worker hours below.</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* Section 1: Project Info */}
          <Card>
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" /> Project Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
              <div className="space-y-2">
                <Label htmlFor="primeContractor">Prime Contractor</Label>
                <Input id="primeContractor" {...form.register("primeContractor")} placeholder="Company Name" />
                {form.formState.errors.primeContractor && <p className="text-xs text-destructive">{form.formState.errors.primeContractor.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subcontractor">Subcontractor (Optional)</Label>
                <Input id="subcontractor" {...form.register("subcontractor")} placeholder="Subcontractor Name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contractNumber">Contract Number</Label>
                <Input id="contractNumber" {...form.register("contractNumber")} placeholder="e.g. CT-2024-001" />
                {form.formState.errors.contractNumber && <p className="text-xs text-destructive">{form.formState.errors.contractNumber.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="agency">Agency</Label>
                <Input id="agency" {...form.register("agency")} placeholder="e.g. NYC DDC" />
                {form.formState.errors.agency && <p className="text-xs text-destructive">{form.formState.errors.agency.message}</p>}
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="projectNameLocation">Project Name & Location</Label>
                <Input id="projectNameLocation" {...form.register("projectNameLocation")} placeholder="e.g. Road Resurfacing - 5th Ave" />
                {form.formState.errors.projectNameLocation && <p className="text-xs text-destructive">{form.formState.errors.projectNameLocation.message}</p>}
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="address">Site Address</Label>
                <Input id="address" {...form.register("address")} placeholder="123 Construction Way, NY" />
                {form.formState.errors.address && <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" {...form.register("date")} />
                {form.formState.errors.date && <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Workers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <User className="h-5 w-5 text-primary" /> Worker Log
              </h3>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => append({ name: "", classification: "", timeIn: "", timeOut: "" })}
                className="border-dashed"
              >
                <Plus className="h-4 w-4 mr-1" /> Add Worker
              </Button>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="relative overflow-hidden transition-all hover:border-primary/30">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-muted px-2 py-1 rounded text-xs font-mono font-medium">
                      WORKER #{index + 1}
                    </div>
                    {fields.length > 1 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => remove(index)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Worker Name</Label>
                      <Input {...form.register(`workers.${index}.name`)} placeholder="Full Name" />
                      {form.formState.errors.workers?.[index]?.name && <p className="text-xs text-destructive">Required</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Classification</Label>
                      <Input {...form.register(`workers.${index}.classification`)} placeholder="e.g. Laborer, Foreman" />
                      {form.formState.errors.workers?.[index]?.classification && <p className="text-xs text-destructive">Required</p>}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Time In</Label>
                        <Input type="time" {...form.register(`workers.${index}.timeIn`)} />
                        {form.formState.errors.workers?.[index]?.timeIn && <p className="text-xs text-destructive">Required</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Time Out</Label>
                        <Input type="time" {...form.register(`workers.${index}.timeOut`)} />
                      </div>
                    </div>

                    {/* Signatures: tap a tile, sign in a pop-up, done (no long scrolling) */}
                    <div className="md:col-span-2 grid grid-cols-2 gap-4 mt-2">
                      <SignatureCell
                        label="Signature In"
                        workerName={form.watch(`workers.${index}.name`) || `Worker #${index + 1}`}
                        value={form.watch(`workers.${index}.signatureIn`) ?? null}
                        onSave={async (val) => {
                          form.setValue(`workers.${index}.signatureIn`, val);
                        }}
                      />
                      <SignatureCell
                        label="Signature Out"
                        workerName={form.watch(`workers.${index}.name`) || `Worker #${index + 1}`}
                        value={form.watch(`workers.${index}.signatureOut`) ?? null}
                        onSave={async (val) => {
                          form.setValue(`workers.${index}.signatureOut`, val);
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Section 3: Contractor Rep */}
          <Card className="border-t-4 border-t-primary/20">
            <CardHeader>
              <CardTitle>Contractor Verification</CardTitle>
              <CardDescription>To be signed by the authorized representative.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="repName">Representative Name</Label>
                  <Input id="repName" {...form.register("contractorRepName")} placeholder="Full Name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repTitle">Title</Label>
                  <Input id="repTitle" {...form.register("contractorRepTitle")} placeholder="e.g. Site Supervisor" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <SignaturePad 
                    label="Authorized Signature"
                    onChange={(val) => form.setValue("contractorRepSignature", val || undefined)}
                    value={form.getValues("contractorRepSignature")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repDate">Date Signed</Label>
                  <Input id="repDate" type="date" {...form.register("contractorRepDate")} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Action */}
          <div className="flex justify-end pt-6">
            <Button 
              type="submit" 
              size="lg" 
              disabled={createLog.isPending}
              className="w-full md:w-auto text-lg px-8 shadow-xl shadow-primary/20"
            >
              {createLog.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-5 w-5" /> Save Daily Log
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
