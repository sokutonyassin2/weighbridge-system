import React, { useState, useMemo } from "react";
import { POPreviewDialog } from "@/components/POPreviewDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Search, Package, CheckCircle, XCircle, AlertCircle, TrendingUp, History as HistoryIcon, Filter, Truck, Plus, Printer, Building2, FileCheck, ArrowRight, ChevronDown, ChevronRight, Users, FileText, Receipt, Upload, ExternalLink, Loader2, Calendar, Trash2, Eye, Image, Check, ChevronsUpDown, Pencil, Layers, CheckCircle2, Clock, Sparkles, X, ShieldCheck, DollarSign, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { printPurchaseOrder } from "@/utils/printUtils";
import { cn } from "@/lib/utils";

const compressImage = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new window.Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpeg", {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    } else {
                        resolve(file);
                    }
                }, 'image/jpeg', 0.6); // Compress aggressively
            };
        };
    });
};

const ProcurementDashboard = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { userProfile, userRole } = useAuth();

    // Fetch User Profile (for display purposes - role comes from useAuth)
    const { data: profile } = useQuery({
        queryKey: ["user-profile"],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;
            const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
            if (error) throw error;
            return data;
        }
    });
    const [searchTerm, setSearchTerm] = useState("");
    const [inventorySearch, setInventorySearch] = useState("");
    const [activeTab, setActiveTab] = useState("requisitions");
    const [isCreateReqOpen, setIsCreateReqOpen] = useState(false);

    // Professional Workflow States
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<any>(null);
    const [approvalDetails, setApprovalDetails] = useState({
        supplier_id: "",
        po_number: "",
        includes_vat: false,
        vat_amount: 0,
        temp_price: 0,
        payment_method_id: "",
        quantity_approving: 0,
        pack_size: 1
    });

    const [batchSupplierOpen, setBatchSupplierOpen] = useState(false);
    const [singleSupplierOpen, setSingleSupplierOpen] = useState(false);

    // Quick Add States
    const [quickAddSupplierOpen, setQuickAddSupplierOpen] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState("");
    const [isAddingSupplier, setIsAddingSupplier] = useState(false);

    const [quickAddAccountOpen, setQuickAddAccountOpen] = useState(false);
    const [newAccountName, setNewAccountName] = useState("");
    const [newAccountBank, setNewAccountBank] = useState("");
    const [newAccountNumber, setNewAccountNumber] = useState("");
    const [isAddingAccount, setIsAddingAccount] = useState(false);

    const [newReq, setNewReq] = useState({
        item_name: "",
        quantity: 1,
        target_company: "SudEnergy Logistics"
    });

    // Batch Quote States
    const [isBatchQuoteOpen, setIsBatchQuoteOpen] = useState(false);
    const [submittingBatchType, setSubmittingBatchType] = useState<"update" | "send" | null>(null);
    
    // Preview Dialog State
    const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
    const [previewSupplierName, setPreviewSupplierName] = useState("");
    const [previewReqs, setPreviewReqs] = useState<any[]>([]);
    
    // Receipt viewer state
    const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
    const [isReceiptViewerOpen, setIsReceiptViewerOpen] = useState(false);
    const [receiptViewerTitle, setReceiptViewerTitle] = useState("");
    const shopReceiptInputRef = React.useRef<HTMLInputElement>(null);
    const [uploadingShopReceiptId, setUploadingShopReceiptId] = useState<string | null>(null);
    const [batchQuoteReqs, setBatchQuoteReqs] = useState<any[]>([]);
    const [batchSharedDetails, setBatchSharedDetails] = useState({
        supplier_id: "",
        po_number: "",
        includes_vat: false,
        payment_method_id: "",
        discount_percentage: 0,
        advance_payment: 0
    });
    const [batchItemPrices, setBatchItemPrices] = useState<Record<string, number>>({});
    const [batchItemQuantities, setBatchItemQuantities] = useState<Record<string, number>>({});
    
    // Vehicle Grouping State
    const [expandedVehicles, setExpandedVehicles] = useState<string[]>([]);

    const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
    const [newSupplier, setNewSupplier] = useState({
        name: "",
        contact_person: "",
        phone: ["", ""], // Supports multiple numbers
        email: "",
        category: "General Spare Parts",
        location: "",
        customCategory: "" // For manual entry
    });

    const [isUpdatePriceOpen, setIsUpdatePriceOpen] = useState(false);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
    const [updatePriceDetails, setUpdatePriceDetails] = useState({
        unit_price: 0
    });

    // Revoke Dialog States
    const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
    const [revokeDialogReqId, setRevokeDialogReqId] = useState<string | null>(null);
    const [revokeReason, setRevokeReason] = useState("");

    // Selection State for Grouped POs
    const [selectedRequisitionIds, setSelectedRequisitionIds] = useState<string[]>([]);
    const [isGroupedPODialogOpen, setIsGroupedPODialogOpen] = useState(false);
    const [groupedPODetails, setGroupedPODetails] = useState({
        supplier_id: "",
        po_number: "",
        company: ""
    });

    // Receive Goods Dialog State
    const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
    const [receivingItem, setReceivingItem] = useState<any>(null);
    const [receivingQuantity, setReceivingQuantity] = useState(0);
    const [receivingNote, setReceivingNote] = useState("");

    // Generate Daily Serial PO Number (PO-YYYYMMDD-XXXX)
    const generatePONumber = (countToday: number = 0) => {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const serial = (countToday + 1).toString().padStart(4, '0');
        return `PO-${date}-${serial}`;
    };

    const handleQuickAddSupplier = async () => {
        if (!newSupplierName.trim()) {
            toast({ variant: "destructive", title: "Error", description: "Supplier name is required." });
            return;
        }
        setIsAddingSupplier(true);
        try {
            const { data, error } = await sb
                .from("garage_suppliers")
                .insert([{ name: newSupplierName.trim() }])
                .select("*")
                .single();
            if (error) throw error;
            
            toast({ title: "Success", description: "Supplier added successfully." });
            setBatchSharedDetails({ ...batchSharedDetails, supplier_id: data.id });
            queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
            setNewSupplierName("");
            setQuickAddSupplierOpen(false);
            setBatchSupplierOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to add supplier." });
        } finally {
            setIsAddingSupplier(false);
        }
    };

    const handleQuickAddAccount = async () => {
        if (!newAccountName.trim() || !newAccountBank.trim() || !newAccountNumber.trim()) {
            toast({ variant: "destructive", title: "Error", description: "All account fields are required." });
            return;
        }
        setIsAddingAccount(true);
        try {
            const { data, error } = await sb
                .from("garage_supplier_payment_methods")
                .insert([{ 
                    account_name: newAccountName.trim(),
                    bank_name: newAccountBank.trim(),
                    account_number: newAccountNumber.trim(),
                    method_type: "Bank",
                    supplier_id: batchSharedDetails.supplier_id
                }])
                .select("*")
                .single();
            if (error) throw error;
            
            toast({ title: "Success", description: "Account added successfully." });
            setBatchSharedDetails({ ...batchSharedDetails, payment_method_id: data.id });
            queryClient.invalidateQueries({ queryKey: ["procurement-payment-methods"] });
            setNewAccountName("");
            setNewAccountBank("");
            setNewAccountNumber("");
            setQuickAddAccountOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to add account." });
        } finally {
            setIsAddingAccount(false);
        }
    };

    // Fetch Inventory (with Prices)
    const { data: inventory, isLoading: isLoadingInventory } = useQuery({
        queryKey: ["procurement-inventory"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_inventory")
                .select("*")
                .order("item_name")
                .limit(100);
            if (error) throw error;
            return data;
        },
        refetchInterval: 60000 // Optimized refresh
    });

    // Fetch Requisitions with Supplier info
    const { data: requisitions, isLoading: isLoadingRequisitions } = useQuery({
        queryKey: ["procurement-requisitions"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number, make_model),
                    garage_suppliers(name),
                    profiles!requested_by(full_name),
                    approved_by_profile:profiles!approved_by(full_name),
                    procurement_approved_by_profile:profiles!procurement_approved_by(full_name)
                `)
                .eq("is_deleted", false)
                .neq("status", "Waiting Review")
                .neq("status", "Pending")
                .order("created_at", { ascending: false })
                .limit(100);

            if (error) {
                console.error("📦 PROCUREMENT ERROR:", error);
                throw error;
            }
            return data;
        },
        refetchInterval: 10000 // Real-time feedback (10s)
    });

    // Fetch Suppliers
    const { data: suppliers } = useQuery({
        queryKey: ["procurement-suppliers"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_suppliers").select("*").order("name");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Payment Methods
    const { data: allPaymentMethods } = useQuery({
        queryKey: ["procurement-payment-methods"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_supplier_payment_methods").select("*");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Departments (Target Companies)
    const { data: departments } = useQuery({
        queryKey: ["procurement-departments"],
        queryFn: async () => {
            const { data, error } = await sb.from("departments").select("*").order("name");
            if (error) throw error;
            return data;
        }
    });

    const [isAddPaymentMethodOpen, setIsAddPaymentMethodOpen] = useState(false);
    const [supplierToDelete, setSupplierToDelete] = useState<any>(null);
    const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState<any>(null);
    const [isEditSupplierOpen, setIsEditSupplierOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<any>(null);
    const [editPhones, setEditPhones] = useState<string[]>([]);
    const [showCustomCategory, setShowCustomCategory] = useState(false);
    const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
    const [reqStatusFilter, setReqStatusFilter] = useState<'Pending' | 'Awaiting Approval' | 'Approved' | 'Paid' | 'Purchased' | 'Delivered' | 'Revoked' | 'All'>('Pending');

    const formatDate = (dateString: string | null) => {
        if (!dateString) return "N/A";
        const [year, month, day] = dateString.split('T')[0].split('-');
        return `${day}/${month}/${year}`;
    };

    // Helper for monthly grouping
    const groupRequisitionsByMonth = (reqs: any[], filterMode: string) => {
        return reqs.reduce((groups: any, req: any) => {
            let groupKey = "";
            if (filterMode === 'Pending') {
                groupKey = "ALL PENDING / DRAFT ORDERS";
            } else {
                const date = new Date(req.created_at);
                groupKey = date.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
            }
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(req);
            return groups;
        }, {});
    };
    const [newPaymentMethod, setNewPaymentMethod] = useState({
        method_type: "Bank",
        bank_name: "",
        account_number: "",
        account_name: "",
        is_default: false
    });

    const [isEditPaymentMethodOpen, setIsEditPaymentMethodOpen] = useState(false);
    const [editingPaymentMethod, setEditingPaymentMethod] = useState<any>(null);

    // Departments State
    const [isManageDeptsOpen, setIsManageDeptsOpen] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");

    // Mutations
    const addDepartmentMutation = useMutation({
        mutationFn: async (name: string) => {
            const { error } = await sb.from("departments").insert([{ name: name.trim() }]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-departments"] });
            setNewDeptName("");
            toast({ title: "Department added" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });

    const deleteDepartmentMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await sb.from("departments").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-departments"] });
            toast({ title: "Department deleted" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });
    const workflowMutation = useMutation({
        mutationFn: async ({ reqId, qty, itemId, details, nextStatus }: { reqId: string, qty: number, itemId?: string, details: any, nextStatus: string }) => {
            const item = (inventory || []).find((i: any) => i.id === itemId);
            const packSize = Number(details?.pack_size) > 0 ? Number(details.pack_size) : 1;
            const purchaseQty = Math.ceil(qty / packSize);
            const subtotal = unitPrice * purchaseQty;
            const vat = details.includes_vat ? subtotal * 0.18 : 0;

            // Fetch the current requisition to check original quantity
            const { data: currentReq } = await sb.from("garage_requisitions").select("*").eq("id", reqId).single();
            if (!currentReq) throw new Error("Requisition not found");

            const updateData: any = {
                status: nextStatus,
                unit_price: unitPrice,
                total_price: subtotal + vat,
                supplier_id: details.supplier_id || null,
                po_number: details.po_number || null,
                includes_vat: details.includes_vat,
                vat_amount: vat,
                payment_details: allPaymentMethods?.find((m: any) => m.id === details.payment_method_id) || null,
                quantity_received: nextStatus === 'Arrived' ? qty : undefined,
                received_at: nextStatus === 'Arrived' ? new Date().toISOString() : undefined,
                received_by: nextStatus === 'Arrived' ? (await sb.auth.getUser()).data.user?.id : undefined
            };

            // Maintain correct quantity fields based on transition
            if (nextStatus === 'Arrived') {
                // When receiving, don't overwrite quantity_approved, but set quantity_received
                updateData.quantity_received = qty;
            } else {
                updateData.quantity_approved = qty;
            }

            if (nextStatus === 'Revoked') {
                updateData.revoke_reason = revokeReason;
            }

            const { error: reqError } = await sb.from("garage_requisitions").update(updateData).eq("id", reqId);
            if (reqError) throw reqError;

            // Split Logic for Partial Fulfillment/Receipt
            const thresholdQty = nextStatus === 'Arrived' ? currentReq.quantity_approved : currentReq.quantity_requested;
            if (['Pending Review', 'Awaiting Approval', 'Approved', 'Arrived'].includes(nextStatus) && qty < thresholdQty) {
                const remaining = thresholdQty - qty;
                const { error: splitError } = await sb.from("garage_requisitions").insert({
                    ...currentReq,
                    id: undefined, // Let DB generate
                    quantity_requested: remaining,
                    original_quantity: currentReq.original_quantity || thresholdQty,
                    parent_id: currentReq.id,
                    status: 'Pending',
                    created_at: new Date().toISOString(),
                    po_number: null,
                    unit_price: 0,
                    total_price: 0,
                    quantity_approved: 0,
                    quantity_received: 0,
                    received_at: null,
                    received_by: null
                });
                if (splitError) console.error("Split Error:", splitError);
                else toast({ title: "Requisition Split", description: `Created new request for remaining ${remaining} units.` });
            }

            // Increase Stock when goods arrive in the store
            if (nextStatus === 'Arrived' && itemId && item) {
                const { error: invError } = await sb.from("garage_inventory").update({
                    quantity: (item.quantity || 0) + qty
                }).eq("id", itemId);
                if (invError) throw invError;
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-inventory"] });
            setIsApproveDialogOpen(false);
            setRevokeReason("");

            const titles: Record<string, string> = {
                'Awaiting Approval': "Quote Submitted for Approval",
                'Approved': "Authorized (Buying Phase)",
                'Paid': "Payment Confirmed",
                'Arrived': "Goods Received & Stocked",
                'Revoked': "Quote Rejected"
            };

            toast({
                title: titles[variables.nextStatus] || "Status Updated",
                description: variables.nextStatus === 'Revoked' ? "Reason recorded." : variables.nextStatus === 'Pending' ? "Draft quote saved." : "Requisition state moved forward."
            });
        }
    });

    // Submit Draft Batch to Management Mutation
    const submitModelBatchMutation = useMutation({
        mutationFn: async ({ reqIds, poNumber }: { reqIds: string[], poNumber: string }) => {
            for (const id of reqIds) {
                const { error } = await sb.from("garage_requisitions").update({ 
                    status: 'Awaiting Approval',
                    po_number: poNumber,
                    procurement_approved_by: profile?.id
                }).eq("id", id);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({
                title: "Batch Submitted",
                description: "Model batch has been sent to Management for approval."
            });
        }
    });

    // Batch Quote Mutation
    const batchWorkflowMutation = useMutation({
        mutationFn: async ({ reqs, sharedDetails, itemPrices, itemQuantities, isUpdateOnly }: { reqs: any[], sharedDetails: any, itemPrices: Record<string, number>, itemQuantities: Record<string, number>, isUpdateOnly?: boolean }) => {
            // Calculate total batch price
            const totalBatchPrice = reqs.reduce((sum, r) => {
                const q = itemQuantities[r.id] || r.quantity_requested || 0;
                const p = itemPrices[r.id] || 0;
                const sub = p * q;
                const disc = sub * ((sharedDetails.discount_percentage || 0) / 100);
                const discSub = sub - disc;
                const v = sharedDetails.includes_vat ? discSub * 0.18 : 0;
                return sum + (discSub + v);
            }, 0);

            // Pre-calculate advance allocations to avoid rounding errors
            const totalAdv = Number(sharedDetails.advance_payment) || 0;
            const advanceAllocations: Record<string, number> = {};
            if (totalAdv > 0) {
                let allocatedSum = 0;
                const itemTotals = reqs.map(r => {
                    const q = itemQuantities[r.id] || r.quantity_requested || 0;
                    const p = itemPrices[r.id] || 0;
                    const sub = p * q;
                    const disc = sub * ((sharedDetails.discount_percentage || 0) / 100);
                    const discSub = sub - disc;
                    const v = sharedDetails.includes_vat ? discSub * 0.18 : 0;
                    return discSub + v;
                });
                for (let i = 0; i < reqs.length; i++) {
                    const ratio = totalBatchPrice > 0 ? (itemTotals[i] / totalBatchPrice) : (1 / reqs.length);
                    if (i === reqs.length - 1) {
                        advanceAllocations[reqs[i].id] = totalAdv - allocatedSum;
                    } else {
                        const amt = Math.round(totalAdv * ratio);
                        advanceAllocations[reqs[i].id] = amt;
                        allocatedSum += amt;
                    }
                }
            }

            const updates = reqs.map(req => {
                const qty = itemQuantities[req.id] || req.quantity_requested || 0;
                const unitPrice = itemPrices[req.id] || 0;
                const subtotal = unitPrice * qty;
                const discount = subtotal * ((sharedDetails.discount_percentage || 0) / 100);
                const discountedSubtotal = subtotal - discount;
                const vat = sharedDetails.includes_vat ? discountedSubtotal * 0.18 : 0;
                const itemTotalPrice = discountedSubtotal + vat;
                
                const updateObj: any = {
                    id: req.id,
                    unit_price: unitPrice,
                    total_price: itemTotalPrice,
                    supplier_id: sharedDetails.supplier_id || null,
                    po_number: sharedDetails.po_number || null,
                    includes_vat: sharedDetails.includes_vat,
                    vat_amount: vat,
                    discount_percentage: sharedDetails.discount_percentage || 0,
                    advance_payment: advanceAllocations[req.id] || 0,
                    payment_details: allPaymentMethods?.find((m: any) => m.id === sharedDetails.payment_method_id) || null,
                    quantity_approved: qty
                };

                if (!isUpdateOnly) {
                    updateObj.status = 'Awaiting Approval';
                }

                return updateObj;
            });

            await Promise.all(updates.map(async (updateData) => {
                const { id, ...data } = updateData;
                const { error } = await sb.from("garage_requisitions").update(data).eq("id", id);
                if (error) throw error;
            }));
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            setIsBatchQuoteOpen(false);
            setBatchQuoteReqs([]);
            toast({
                title: variables.isUpdateOnly ? "Quotes Updated" : "Quotes Submitted",
                description: variables.isUpdateOnly ? "Draft prices and supplier details saved." : "All selected items have been sent for Management Approval."
            });
        },
        onSettled: () => {
            setSubmittingBatchType(null);
        }
    });

    const uploadSupplierReceiptMutation = useMutation({
        mutationFn: async ({ reqIds, file }: { reqIds: string[], file: File }) => {
            const fileToUpload = file.type.startsWith('image/') ? await compressImage(file) : file;
            const fileExt = fileToUpload.name.split('.').pop() || 'jpeg';
            const filePath = `supplier-receipts/SUPP-${reqIds[0]}-${Date.now()}.${fileExt}`;
            const { data: uploadData, error: uploadError } = await (supabase as any).storage
                .from('receipts')
                .upload(filePath, fileToUpload);
            if (uploadError) throw uploadError;
            
            const { data: urlData } = (supabase as any).storage
                .from('receipts')
                .getPublicUrl(filePath);
            const receiptUrl = urlData?.publicUrl || null;

            if (receiptUrl) {
                for (const id of reqIds) {
                    const { error } = await sb
                        .from("garage_requisitions")
                        .update({ delivery_receipt_url: receiptUrl })
                        .eq("id", id);
                    if (error) throw error;
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({
                title: "Receipt Uploaded",
                description: "The supplier receipt has been successfully attached.",
                variant: "default"
            });
        },
        onError: (error: any) => {
            console.error("Upload failed:", error);
            toast({
                title: "Upload Failed",
                description: error.message || "Failed to upload supplier receipt.",
                variant: "destructive"
            });
        }
    });

    const addSupplierMutation = useMutation({
        mutationFn: async (supplier: any) => {
            // Remove customCategory before sending to DB as it doesn't exist in the schema
            const { customCategory, ...dbSupplier } = supplier;
            const { error } = await sb.from("garage_suppliers").insert([dbSupplier]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
            toast({ title: "Supplier Added", description: "New supplier registered." });
            setIsAddSupplierOpen(false);
            setNewSupplier({ name: "", contact_person: "", phone: ["", ""], email: "", category: "General Spare Parts", location: "", customCategory: "" });
            setShowCustomCategory(false);
        },
        onError: (error: any) => {
            console.error("Supplier Registration Error:", error);
            toast({
                variant: "destructive",
                title: "Registration Failed",
                description: error.message || "Please check all fields and try again."
            });
        }
    });

    const deleteSupplierMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await sb.from("garage_suppliers").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
            toast({ title: "Supplier Deleted", description: "Supplier removed from directory." });
        }
    });    
    const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
    const [quickEditData, setQuickEditData] = useState({ id: "", quantity_requested: 0, unit_price: 0, quantity_approved: 0, item_name: "", pack_size: 1 });

    const deleteRequisitionMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("garage_requisitions").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({ title: "Requisition Deleted", description: "The request has been fully removed from the system." });
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: error.message || "Could not delete requisition."
            });
        }
    });

    const deleteRequisitionGroupMutation = useMutation({
        mutationFn: async (reqIds: string[]) => {
            for (const id of reqIds) {
                const { error } = await supabase.from("garage_requisitions").delete().eq("id", id);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({ title: "Deleted", description: "The requisition(s) have been fully removed from the system." });
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: error.message || "Could not delete requisitions."
            });
        }
    });

    const quickEditMutation = useMutation({
        mutationFn: async (data: typeof quickEditData) => {
            const { data: reqData, error: fetchError } = await supabase.from("garage_requisitions")
                .select("includes_vat")
                .eq("id", data.id)
                .single();
                
            if (fetchError) throw fetchError;
            
            const packSize = Number(data.pack_size) > 0 ? Number(data.pack_size) : 1;
            const purchaseQty = Math.ceil(data.quantity_approved / packSize);
            const subtotal = purchaseQty * data.unit_price;
            const vat = reqData?.includes_vat ? (subtotal * 0.18) : 0;
            const totalPrice = subtotal + vat;

            const { error } = await supabase.from("garage_requisitions")
                .update({ 
                    quantity_requested: data.quantity_requested,
                    quantity_approved: data.quantity_approved,
                    unit_price: data.unit_price,
                    vat_amount: vat,
                    total_price: totalPrice
                })
                .eq("id", data.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            setIsQuickEditOpen(false);
            toast({ title: "Updated", description: "Price, quantity and totals recalculated successfully." });
        }
    });

    const updateSupplierMutation = useMutation({
        mutationFn: async (supplier: any) => {
            const { id, ...updateData } = supplier;
            const { error } = await sb.from("garage_suppliers").update(updateData).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
            toast({ title: "Supplier Updated", description: "Supplier records saved." });
            setIsEditSupplierOpen(false);
            setEditingSupplier(null);
        }
    });

    const addPaymentMethodMutation = useMutation({
        mutationFn: async (method: any) => {
            const { error } = await sb.from("garage_supplier_payment_methods").insert([method]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-payment-methods"] });
            toast({ title: "Payment Method Added", description: "Supplier records updated." });
            setIsAddPaymentMethodOpen(false);
            setNewPaymentMethod({ method_type: "Bank", bank_name: "", account_number: "", account_name: "", is_default: false });
        }
    });

    const deletePaymentMethodMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await sb.from("garage_supplier_payment_methods").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-payment-methods"] });
            toast({ title: "Payment Method Deleted", description: "Supplier record removed." });
        }
    });

    const editPaymentMethodMutation = useMutation({
        mutationFn: async (method: any) => {
            const { id, ...updateData } = method;
            const { error } = await sb.from("garage_supplier_payment_methods").update(updateData).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-payment-methods"] });
            toast({ title: "Payment Method Updated", description: "Supplier records saved." });
            setIsEditPaymentMethodOpen(false);
            setEditingPaymentMethod(null);
        }
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ reqId, status, revokeReason }: { reqId: string, status: string, revokeReason?: string | null }) => {
            const updateData: any = {
                status,
                status_updated_at: new Date().toISOString()
            };

            if (status === 'Revoked' && revokeReason) {
                updateData.revoke_reason = revokeReason;
            }

            const { error } = await sb.from("garage_requisitions").update(updateData).eq("id", reqId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] }); // Also refresh garage side
            toast({ title: "Status Updated", description: "Requisition status has been updated successfully." });
        }
    });

    const bulkUpdateRequisitionsMutation = useMutation({
        mutationFn: async ({ ids, po_number, supplier_id }: { ids: string[], po_number: string, supplier_id: string }) => {
            const { error } = await sb.from("garage_requisitions").update({
                status: 'Purchased',
                po_number: po_number,
                supplier_id: supplier_id,
                status_updated_at: new Date().toISOString()
            }).in("id", ids);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
            setIsGroupedPODialogOpen(false);
            setSelectedRequisitionIds([]);
            toast({ title: "Grouped PO Generated", description: `PO created for ${selectedRequisitionIds.length} items.` });
        }
    });

    const createReqMutation = useMutation({
        mutationFn: async (req: typeof newReq) => {
            const userResponse = await sb.auth.getUser();
            const userId = userResponse.data.user?.id;

            const { data, error } = await sb.from("garage_requisitions").insert([{
                item_name: req.item_name,
                quantity_requested: req.quantity,
                target_company: req.target_company,
                status: 'Pending',
                request_type: 'General',
                requested_by: userId
            }]).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({ title: "Requisition Created", description: `Internal request for ${newReq.target_company} logged.` });
            setIsCreateReqOpen(false);
            setNewReq({ item_name: "", quantity: 1, target_company: "SudEnergy Logistics" });
        },
        onError: (error: any) => {
            console.error("Create Requisition Error:", error);
            toast({ 
                variant: "destructive", 
                title: "Failed to Send Request", 
                description: error.message || "An error occurred while creating the requisition." 
            });
        }
    });

    const updatePricingMutation = useMutation({
        mutationFn: async ({ id, price }: { id: string, price: number }) => {
            const { error } = await sb.from("garage_inventory").update({
                unit_price: price
            }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            toast({ title: "Unit Price Updated", description: "Pricing records saved." });
            setIsUpdatePriceOpen(false);
        }
    });

    const printPurchaseOrder = (params: { poNumber?: string, reqId?: string }) => {
        let relatedReqs: any[] = [];

        if (params.poNumber) {
            relatedReqs = (requisitions || []).filter((r: any) => r.po_number === params.poNumber);
        } else if (params.reqId) {
            const single = (requisitions || []).find((r: any) => r.id === params.reqId);
            if (single) relatedReqs = [single];
        }

        if (relatedReqs.length === 0) {
            toast({ variant: "destructive", title: "Error", description: "No items found to print." });
            return;
        }

        const firstReq = relatedReqs[0];
        const displayPONumber = params.poNumber || "REQ-" + firstReq.id.slice(0, 8).toUpperCase();
        let subtotal = 0;
        let totalVat = 0;

        const itemsByVehicle: Record<string, any[]> = {};
        let modelDisplay = "Various Models";

        relatedReqs.forEach((req: any) => {
            const plate = req.vehicle?.vehicle_no || req.vehicle?.horse_number || 'General/Workshop';
            if (!itemsByVehicle[plate]) itemsByVehicle[plate] = [];
            itemsByVehicle[plate].push(req);

            if (req.vehicle?.make_model) {
                modelDisplay = req.vehicle.make_model;
            }
        });

        let itemsHtml = "";

        Object.entries(itemsByVehicle).forEach(([plate, reqs]) => {
            itemsHtml += `
                <tr>
                    <td colspan="4" style="background-color: #f8fafc; font-weight: 800; color: #4f46e5; padding: 6px 8px; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0;">
                        Vehicle: ${plate}
                    </td>
                </tr>
            `;

            reqs.forEach((req: any) => {
                const item = inventory?.find((i: any) => i.id === req.item_id);
                const price = req.unit_price || item?.unit_price || 0;
                const qty = req.quantity_approved || req.quantity_requested;
                const lineTotal = price * qty;
                const lineVat = req.includes_vat ? (lineTotal * 0.18) : 0;

                subtotal += lineTotal;
                totalVat += lineVat;

                itemsHtml += `
                    <tr>
                        <td style="padding-left: 16px;">
                            <div style="font-weight: 700; color: #1e293b;">${req.item_name}</div>
                        </td>
                        <td style="text-align: center;">${qty}</td>
                        <td style="text-align: right;">${price.toLocaleString()}</td>
                        <td style="text-align: right; font-weight: 600;">${lineTotal.toLocaleString()}</td>
                    </tr>
                `;
            });
        });

        const finalTotal = subtotal + totalVat;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Purchase Order - ${displayPONumber}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 20px; color: #1e293b; max-width: 800px; margin: auto; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 15px; }
                        .company { font-size: 20px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }
                        .po-label { background: #4f46e5; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; margin-top: 5px; display: inline-block; }
                        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                        .meta-box h3 { font-size: 9px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px; }
                        .meta-box p { font-size: 12px; font-weight: 600; margin: 1px 0; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        th { text-align: left; background: #f8fafc; padding: 8px; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                        td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
                        .summary-table { width: 250px; margin-left: auto; }
                        .summary-table td { padding: 4px 8px; border: none; }
                        .total-row { font-size: 14px; font-weight: 900; color: #1e293b; border-top: 2px solid #e2e8f0 !important; }
                        .footer { margin-top: 40px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 10px; }
                        .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 60px; margin-top: 40px; }
                        .sig-line { text-align: center; padding-top: 4px; font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="company">${firstReq.target_company}</div>
                            <div style="font-size: 12px; color: #64748b; font-weight: 600;">Logistics & Engineering Procurement</div>
                        </div>
                        <div style="text-align: right;">
                            <h1 style="margin: 0; font-size: 24px; color: #1e293b; letter-spacing: -1px;">PURCHASE ORDER</h1>
                            <div class="po-label">PO #${displayPONumber}</div>
                        </div>
                    </div>
                    
                    <div class="meta-grid">
                        <div class="meta-box">
                            <h3>Vendor / Supplier</h3>
                            <p>${firstReq.garage_suppliers?.name || 'N/A'}</p>
                            <p style="font-size: 11px; font-weight: 400; color: #64748b;">Official Registered Vendor</p>
                        </div>
                        <div style="text-align: right;">
                            <div class="meta-box">
                                <h3>Order Details</h3>
                                <p>Date: ${new Date(firstReq.created_at).toLocaleDateString()}</p>
                                <p>Items: ${relatedReqs.length}</p>
                            </div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Description / Vehicle</th>
                                <th style="text-align: center;">Qty</th>
                                <th style="text-align: right;">Unit Price (TZS)</th>
                                <th style="text-align: right;">Amount (TZS)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <table class="summary-table">
                        <tr>
                            <td>Subtotal</td>
                            <td style="text-align: right;">${subtotal.toLocaleString()}</td>
                        </tr>
                        ${totalVat > 0 ? `
                        <tr style="color: #4f46e5; font-weight: 600;">
                            <td>VAT (18%)</td>
                            <td style="text-align: right;">+ ${totalVat.toLocaleString()}</td>
                        </tr>
                        ` : ''}
                        <tr class="total-row">
                            <td>TOTAL TZS</td>
                            <td style="text-align: right;">${finalTotal.toLocaleString()}</td>
                        </tr>
                    </table>

                    <div class="sig-grid" style="grid-template-columns: 1fr 1fr 1fr;">
                        <div class="sig-line">
                            <span style="display:block; font-weight: 800; color: #1e293b; margin-bottom: 4px;">${firstReq.profiles?.full_name || 'N/A'}</span>
                            Requested By (Garage)
                        </div>
                        <div class="sig-line">
                            <span style="display:block; font-weight: 800; color: #1e293b; margin-bottom: 4px;">${userProfile?.full_name || 'N/A'}</span>
                            Prepared By (Procurement)
                        </div>
                        <div class="sig-line">
                            <span style="display:block; font-weight: 800; color: #1e293b; margin-bottom: 4px;">${firstReq.approved_by_profile?.full_name || 'Pending Approval'}</span>
                            Authorized By (Management)
                        </div>
                    </div>

                    <div class="footer">
                        This is a computer-generated document. System: SudEnergy Logistics Platform
                    </div>
                    <script>window.print();</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Helper: Get Badge for status
    const getStatusBadge = (status: string, req?: any) => {
        switch (status) {
            case 'Pending': return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">New Request</Badge>;
            case 'Awaiting Approval': return <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200 uppercase text-[10px]">Quote Submitted</Badge>;
            case 'Approved': return <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200 uppercase text-[10px]">Authorized (Buying)</Badge>;
            case 'Paid': return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 uppercase text-[10px]">Payment Confirmed</Badge>;
            case 'Closed': return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Released & Closed</Badge>;
            case 'Purchased': return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 uppercase text-[10px]">Purchased</Badge>;
            case 'Delivered': return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">Delivered</Badge>;
            case 'Rejected': return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Rejected</Badge>;
            case 'Processing':
                return (
                    <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Processing</Badge>
                        {req?.processing_reason && (
                            <span className="text-[10px] text-slate-500 italic">Reason: {req.processing_reason}</span>
                        )}
                    </div>
                );
            case 'Revoked':
                return (
                    <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200">Revoked / Rework</Badge>
                        {req?.revoke_reason && (
                            <span className="text-[10px] text-slate-500 italic font-medium">Reason: {req.revoke_reason}</span>
                        )}
                    </div>
                );
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    // Helper: Get Department Name from Company
    const getDepartmentName = (company: string) => {
        if (!company) return "Garage";
        const c = company.toUpperCase();
        // If it's a Logistics company but in the Garage dashboard, label it as "Garage"
        if (c.includes("LOGISTICS") || c.includes("GARAGE")) return "Garage";
        if (c.includes("WEIGHBRIDGE")) return "Weighbridge";
        if (c.includes("SUDENERGY")) return company.replace("SUDENERGY", "").trim() || "Garage";
        return company;
    };

    return (
        <div className="space-y-4 md:space-y-6 p-4 md:p-6 animate-fade-in bg-slate-50/30 min-h-screen max-w-[100vw] overflow-x-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 flex flex-wrap items-center gap-2">
                        <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-900" />
                        Procurement Command
                        <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[10px] uppercase font-semibold animate-pulse mt-1 md:mt-0">Live Syncing</Badge>
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium tracking-tight">Purchase Order (PO) Management & Strategic Sourcing</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
                    {(isLoadingRequisitions || isLoadingInventory) && (
                        <div className="flex items-center gap-2 text-blue-950 text-xs font-semibold animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Fetching Data...
                        </div>
                    )}
                    <div className="flex gap-2 w-full md:w-auto">
                        <Button onClick={() => setIsCreateReqOpen(true)} className="bg-blue-900 hover:bg-black text-xs font-medium h-9 uppercase tracking-wider w-full md:w-auto">
                            <Plus className="w-4 h-4 mr-1" /> New Requisition
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="requisitions" className="w-full" onValueChange={setActiveTab}>
                <TabsList className="bg-white border-b border-slate-200 w-full justify-start rounded-none h-auto overflow-x-auto hide-scrollbar flex-nowrap p-0 gap-4 md:gap-8">
                    <TabsTrigger value="requisitions" className="data-[state=active]:border-blue-900 data-[state=active]:text-blue-900 border-b-2 border-transparent rounded-none h-12 px-2 md:px-4 text-[10px] md:text-xs font-medium uppercase tracking-widest whitespace-nowrap">
                        <FileText className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Requisitions
                    </TabsTrigger>
                    <TabsTrigger value="suppliers" className="data-[state=active]:border-blue-900 data-[state=active]:text-blue-900 border-b-2 border-transparent rounded-none h-12 px-2 md:px-4 text-[10px] md:text-xs font-medium whitespace-nowrap">
                        <Users className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Suppliers
                    </TabsTrigger>
                    {(userRole === 'storekeeper' || userRole === 'admin' || userRole === 'super_admin') && (
                        <TabsTrigger value="arrivals" className="data-[state=active]:border-blue-900 data-[state=active]:text-blue-900 border-b-2 border-transparent rounded-none h-12 px-2 md:px-4 text-[10px] md:text-xs font-medium whitespace-nowrap">
                            <Truck className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Store Arrivals
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="requisitions" className="mt-6 space-y-6">
                    {(() => {
                        const formatTSh = (val: any) => {
                            if (!val && val !== 0) return "TShs. 0";
                            return `TShs. ${parseFloat(val || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                        };

                        const all = requisitions || [];
                        const pendingCount = all.filter((r: any) =>
                            r.status === 'Pending' || r.status === 'Pending Review' || r.status === 'Reviewed & Pending' || r.status === 'Awaiting Approval' || r.status === 'Revoked'
                        ).length;
                        const approvedCount = all.filter((r: any) => r.status === 'Approved').length;
                        const purchasedCount = all.filter((r: any) =>
                            r.status === 'Purchased' || r.status === 'Paid' || r.status === 'Delivered' || r.status === 'Closed' || r.status === 'Arrived'
                        ).length;
                        const poIssuedList = all.filter((r: any) => r.po_number);
                        const poIssuedCount = poIssuedList.length;
                        const poTotalValuationTZS = poIssuedList.reduce((acc: number, r: any) => {
                            const qty = r.quantity_approved || r.management_reviewed_quantity || r.quantity_requested || 1;
                            const price = r.unit_price || 0;
                            return acc + (qty * price);
                        }, 0);
                        const lowStockCount = (inventory || []).filter((i: any) => (i.quantity || 0) <= (i.min_threshold || 0)).length;
                        const totalInventoryValuationTZS = (inventory || []).reduce((acc: number, item: any) => acc + ((item.quantity || 0) * (item.unit_price || 0)), 0);

                        const filteredReqs = all.filter((r: any) => {
                            const searchLower = searchTerm.trim().toLowerCase();
                            const matchesSearch = !searchLower || (
                                (r.item_name || "").toLowerCase().includes(searchLower) ||
                                (r.target_company || "").toLowerCase().includes(searchLower) ||
                                (r.garage_suppliers?.name || "").toLowerCase().includes(searchLower) ||
                                (r.po_number || "").toLowerCase().includes(searchLower) ||
                                (r.status || "").toLowerCase().includes(searchLower) ||
                                (r.requirement_category || "").toLowerCase().includes(searchLower) ||
                                (r.vehicle?.make_model || "").toLowerCase().includes(searchLower) ||
                                (r.vehicle?.vehicle_no || "").toLowerCase().includes(searchLower) ||
                                (r.vehicle?.horse_number || "").toLowerCase().includes(searchLower) ||
                                (r.vehicle?.trailer_number || "").toLowerCase().includes(searchLower)
                            );

                            const matchesStatus = reqStatusFilter === 'All' ? true :
                                reqStatusFilter === 'Pending' ? (r.status === 'Pending' || r.status === 'Pending Review' || r.status === 'Reviewed & Pending' || r.status === 'Awaiting Approval' || r.status === 'Revoked') :
                                reqStatusFilter === 'Purchased' ? (r.status === 'Purchased' || r.status === 'Paid' || r.status === 'Delivered' || r.status === 'Closed' || r.status === 'Arrived') :
                                r.status === reqStatusFilter;

                            return matchesSearch && matchesStatus;
                        });

                        // Unified supplier grouping (NEVER duplicates same supplier across months)
                        const groups: Record<string, {
                            id: string;
                            type: 'supplier' | 'vehicle';
                            title: string;
                            subtitle: string;
                            poTotal: number;
                            latestDate: string;
                            hasEmergency: boolean;
                            hasAwaitingApproval: boolean;
                            reqs: any[];
                        }> = {};

                        filteredReqs.forEach((req: any) => {
                            let key = "";
                            let type: 'supplier' | 'vehicle' = 'supplier';
                            let title = "";
                            let subtitle = "";

                            if (req.supplier_id || req.garage_suppliers?.name) {
                                const sName = req.garage_suppliers?.name || "Unassigned Supplier";
                                key = `supplier_${req.supplier_id || sName}`;
                                type = 'supplier';
                                title = sName;
                                subtitle = "Vendor Quotations & Purchase Orders";
                            } else if (req.vehicle_id && req.vehicle) {
                                const vPlate = req.vehicle.vehicle_no || req.vehicle.horse_number || req.vehicle.make_model || "Workshop Vehicle";
                                key = `vehicle_${req.vehicle_id}`;
                                type = 'vehicle';
                                title = `${vPlate} • ${req.vehicle.make_model || 'Fleet Vehicle'}`;
                                subtitle = "Fleet Mechanical & Workshop Requisitions";
                            } else {
                                key = "general_internal";
                                type = 'vehicle';
                                title = "General Workshop & Facility Supplies";
                                subtitle = "Internal Non-Fleet Requisitions";
                            }

                            if (!groups[key]) {
                                groups[key] = {
                                    id: key,
                                    type,
                                    title,
                                    subtitle,
                                    poTotal: 0,
                                    latestDate: req.created_at || "",
                                    hasEmergency: false,
                                    hasAwaitingApproval: false,
                                    reqs: []
                                };
                            }

                            groups[key].reqs.push(req);

                            let lineTotal = 0;
                            if (req.total_price && Number(req.total_price) > 0) {
                                lineTotal = Number(req.total_price);
                            } else {
                                const qty = req.quantity_approved || req.management_reviewed_quantity || req.quantity_requested || 1;
                                const unitPrice = req.unit_price > 0 ? req.unit_price : ((inventory || []).find((i: any) => i.id === req.item_id)?.unit_price || 0);
                                const base = qty * unitPrice;
                                const disc = base * ((req.discount_percentage || 0) / 100);
                                const vat = req.includes_vat ? ((base - disc) * 0.18) : 0;
                                lineTotal = base - disc + vat;
                            }
                            groups[key].poTotal += lineTotal;

                            if (req.is_emergency) groups[key].hasEmergency = true;
                            if (req.status === 'Awaiting Approval') groups[key].hasAwaitingApproval = true;
                            if (new Date(req.created_at) > new Date(groups[key].latestDate)) {
                                groups[key].latestDate = req.created_at;
                            }
                        });

                        const groupList = Object.values(groups);
                        const groupKeys = Object.keys(groups);
                        const isAllExpanded = groupKeys.length > 0 && groupKeys.every(k => expandedVehicles.includes(k));

                        const handleToggleAll = () => {
                            if (isAllExpanded) {
                                setExpandedVehicles([]);
                            } else {
                                setExpandedVehicles(groupKeys);
                            }
                        };

                        const toggleGroup = (groupId: string) => {
                            setExpandedVehicles(prev =>
                                prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
                            );
                        };

                        return (
                            <div className="space-y-6">
                                {/* ── 1. Executive Top Metric Cards ────────────────────────────── */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* 1. Pending Actions */}
                                    <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending Actions</span>
                                            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                                <AlertCircle size={16} />
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-baseline gap-2">
                                            <span className="text-2xl font-black text-slate-900">{pendingCount}</span>
                                            <span className="text-xs font-bold text-amber-600">Awaiting Action</span>
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-400 font-medium">
                                            Quotes, boss reviews & authorizations needed
                                        </div>
                                    </Card>

                                    {/* 2. PO's Issued */}
                                    <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PO's Issued</span>
                                            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                                <FileCheck size={16} />
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-baseline gap-2">
                                            <span className="text-2xl font-black text-slate-900">{poIssuedCount}</span>
                                            <span className="text-xs font-bold text-blue-600">Purchase Orders</span>
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-400 font-medium truncate">
                                            Est. Value: {formatTSh(poTotalValuationTZS)}
                                        </div>
                                    </Card>

                                    {/* 3. Low Stock Alert */}
                                    <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Low Stock Alert</span>
                                            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                                                <Package size={16} />
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-baseline gap-2">
                                            <span className="text-2xl font-black text-slate-900">{lowStockCount}</span>
                                            <span className="text-xs font-bold text-rose-600">Reorders Due</span>
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-400 font-medium">
                                            Inventory items below safety threshold
                                        </div>
                                    </Card>

                                    {/* 4. Total Store Valuation */}
                                    <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Store Valuation</span>
                                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                                <TrendingUp size={16} />
                                            </div>
                                        </div>
                                        <div className="mt-2">
                                            <div className="text-lg font-black text-slate-900 leading-tight">
                                                {formatTSh(totalInventoryValuationTZS)}
                                            </div>
                                            <div className="text-[11px] font-bold text-emerald-600 mt-0.5">
                                                {(inventory || []).length} Stocked Spare Lines
                                            </div>
                                        </div>
                                        <div className="mt-1 text-[11px] text-slate-400 font-medium">
                                            Estimated total workshop spare inventory
                                        </div>
                                    </Card>
                                </div>

                                {/* ── 2. Operations Control Toolbar ────────────────────────────── */}
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                                    {/* Search Input */}
                                    <div className="relative flex-1 max-w-md">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                        <Input
                                            placeholder="Search by part name, supplier, PO #, truck plate, driver..."
                                            className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 focus:bg-white text-xs font-medium rounded-xl"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchTerm("")}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Status Filter Toggle Pills */}
                                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                                        <button
                                            type="button"
                                            onClick={() => setReqStatusFilter('Pending')}
                                            className={cn(
                                                "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                                                reqStatusFilter === 'Pending'
                                                    ? "bg-amber-600 text-white shadow-xs"
                                                    : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                            )}
                                        >
                                            <AlertCircle size={11} />
                                            <span>New Requests ({pendingCount})</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setReqStatusFilter('Approved')}
                                            className={cn(
                                                "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                                                reqStatusFilter === 'Approved'
                                                    ? "bg-blue-600 text-white shadow-xs"
                                                    : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                                            )}
                                        >
                                            <FileCheck size={11} />
                                            <span>Authorized ({approvedCount})</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setReqStatusFilter('Purchased')}
                                            className={cn(
                                                "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                                                reqStatusFilter === 'Purchased'
                                                    ? "bg-emerald-600 text-white shadow-xs"
                                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                            )}
                                        >
                                            <CheckCircle2 size={11} />
                                            <span>Completed ({purchasedCount})</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setReqStatusFilter('All')}
                                            className={cn(
                                                "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                                reqStatusFilter === 'All'
                                                    ? "bg-slate-900 text-white shadow-xs"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            )}
                                        >
                                            All ({all.length})
                                        </button>
                                    </div>

                                    {/* Expand All / Collapse All */}
                                    <div className="flex items-center gap-2 ml-auto lg:ml-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleToggleAll}
                                            className="h-8 px-3 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5 rounded-xl"
                                        >
                                            <Layers size={13} className="text-slate-400" />
                                            <span>{isAllExpanded ? "Collapse All" : "Expand All"}</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* ── 3. Content List ────────────────────────────────────────── */}
                                {isLoadingRequisitions ? (
                                    <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                                        <Loader2 size={28} className="mx-auto text-blue-900 animate-spin mb-3" />
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                            Loading Procurement Requisitions...
                                        </p>
                                    </Card>
                                ) : groupList.length === 0 ? (
                                    <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                                        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                            <Package size={28} className="text-slate-400" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                            No Requisitions Found
                                        </h3>
                                        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-medium">
                                            {searchTerm
                                                ? "No requisitions match your search query. Try clearing your search keyword."
                                                : "No active procurement orders in this status category."}
                                        </p>
                                        {searchTerm && (
                                            <div className="mt-5 flex items-center justify-center">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setSearchTerm("")}
                                                    className="h-9 px-4 text-xs font-bold rounded-xl"
                                                >
                                                    Clear Search
                                                </Button>
                                            </div>
                                        )}
                                    </Card>
                                ) : (
                                    <div className="space-y-4">
                                        {groupList.map((group) => {
                                            const isExpanded = expandedVehicles.includes(group.id);
                                            const firstReq = group.reqs[0];

                                            return (
                                                <Card
                                                    key={group.id}
                                                    className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all duration-200"
                                                >
                                                    {/* Group Header Card */}
                                                    <div
                                                        onClick={() => toggleGroup(group.id)}
                                                        className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/90 via-white to-slate-50/50 hover:from-slate-100/90 hover:to-slate-100/60 border-b border-slate-200 cursor-pointer transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none"
                                                    >
                                                        <div className="flex items-center gap-3.5 flex-1">
                                                            <div className="text-slate-400 transition-transform duration-200">
                                                                {isExpanded ? <ChevronDown size={20} className="text-slate-700" /> : <ChevronRight size={20} />}
                                                            </div>

                                                            <div className={cn(
                                                                "p-2.5 text-white rounded-xl shadow-xs",
                                                                group.type === 'supplier' ? "bg-blue-900" : "bg-slate-800"
                                                            )}>
                                                                {group.type === 'supplier' ? <Building2 size={18} /> : <Wrench size={18} />}
                                                            </div>

                                                            <div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                                                                        {group.title}
                                                                    </h3>
                                                                    <Badge className={cn(
                                                                        "text-[10px] font-black border-none px-2 h-5 rounded-md",
                                                                        group.type === 'supplier' ? "bg-blue-900 text-white" : "bg-slate-800 text-white"
                                                                    )}>
                                                                        {group.reqs.length} {group.reqs.length === 1 ? 'Item' : 'Items'}
                                                                    </Badge>
                                                                    {group.hasEmergency && (
                                                                        <Badge variant="destructive" className="text-[9px] font-bold px-2 py-0.5 animate-pulse">
                                                                            EMERGENCY ORDER
                                                                        </Badge>
                                                                    )}
                                                                    {group.hasAwaitingApproval && (
                                                                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">
                                                                            WAITING APPROVAL
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                                    {group.subtitle} • Latest: {formatDate(group.latestDate)}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Group Totals & Header Action Buttons */}
                                                        <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200" onClick={(e) => e.stopPropagation()}>
                                                            <div className="space-y-0.5 text-right">
                                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Est. PO Total</span>
                                                                <div className="text-sm font-black text-blue-900 leading-none">
                                                                    {formatTSh(group.poTotal)}
                                                                </div>
                                                                <span className="text-[10px] font-bold text-slate-400 block">
                                                                    {group.reqs.length} Parts Allocated
                                                                </span>
                                                            </div>

                                                            {/* Contextual Action Buttons on Header */}
                                                            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                                                                {reqStatusFilter === 'Purchased' ? (
                                                                    <>
                                                                        {firstReq.po_number && (
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-8 text-[10px] font-bold uppercase border-slate-200 hover:bg-slate-100 gap-1 rounded-lg"
                                                                                onClick={() => printPurchaseOrder({ poNumber: firstReq.po_number })}
                                                                            >
                                                                                <Printer size={12} />
                                                                                Print PO
                                                                            </Button>
                                                                        )}
                                                                        {(() => {
                                                                            const payUrl = group.reqs.find((r: any) => r.payment_receipt_url)?.payment_receipt_url;
                                                                            const suppUrl = group.reqs.find((r: any) => r.delivery_receipt_url)?.delivery_receipt_url;
                                                                            return (
                                                                                <>
                                                                                    {payUrl && (
                                                                                        <Button 
                                                                                            variant="outline" 
                                                                                            size="sm" 
                                                                                            className="h-8 text-[10px] font-bold uppercase border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg"
                                                                                            onClick={() => window.open(payUrl, '_blank')}
                                                                                        >
                                                                                            <Receipt size={12} className="mr-1" /> Payment Receipt
                                                                                        </Button>
                                                                                    )}
                                                                                    {suppUrl ? (
                                                                                        <Button 
                                                                                            variant="outline" 
                                                                                            size="sm" 
                                                                                            className="h-8 text-[10px] font-bold uppercase border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg"
                                                                                            onClick={() => window.open(suppUrl, '_blank')}
                                                                                        >
                                                                                            <FileText size={12} className="mr-1" /> Supp Receipt
                                                                                        </Button>
                                                                                    ) : (
                                                                                        <Button
                                                                                            size="sm"
                                                                                            className="h-8 text-[10px] bg-purple-600 hover:bg-purple-700 text-white font-bold uppercase shadow-xs rounded-lg gap-1"
                                                                                            disabled={uploadSupplierReceiptMutation.isPending}
                                                                                            onClick={() => {
                                                                                                const input = document.createElement('input');
                                                                                                input.type = 'file';
                                                                                                input.accept = 'image/*,.pdf';
                                                                                                input.onchange = (ev: any) => {
                                                                                                    const file = ev.target.files?.[0];
                                                                                                    if (file) {
                                                                                                        uploadSupplierReceiptMutation.mutate({
                                                                                                            reqIds: group.reqs.map((r: any) => r.id),
                                                                                                            file
                                                                                                        });
                                                                                                    }
                                                                                                };
                                                                                                input.click();
                                                                                            }}
                                                                                        >
                                                                                            <Upload size={12} /> Upload Receipt
                                                                                        </Button>
                                                                                    )}
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="h-8 text-[10px] font-bold uppercase border-blue-200 text-blue-800 hover:bg-blue-50 rounded-lg"
                                                                            onClick={() => {
                                                                                setPreviewSupplierName(group.title);
                                                                                setPreviewReqs(group.reqs);
                                                                                setIsPreviewDialogOpen(true);
                                                                            }}
                                                                        >
                                                                            Preview PO
                                                                        </Button>

                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="h-8 text-[10px] font-bold uppercase border-blue-200 text-blue-800 hover:bg-blue-50 rounded-lg"
                                                                            onClick={() => {
                                                                                setBatchQuoteReqs(group.reqs);
                                                                                setBatchSharedDetails({
                                                                                    supplier_id: firstReq.supplier_id || "",
                                                                                    po_number: generatePONumber(requisitions?.filter((r: any) => new Date(r.created_at).toDateString() === new Date().toDateString() && r.po_number).length || 0),
                                                                                    includes_vat: firstReq.includes_vat || false,
                                                                                    payment_method_id: firstReq.payment_details?.id || "",
                                                                                    discount_percentage: firstReq.discount_percentage || 0
                                                                                });
                                                                                const initialPrices: Record<string, number> = {};
                                                                                const initialQuantities: Record<string, number> = {};
                                                                                group.reqs.forEach((r: any) => {
                                                                                    initialPrices[r.id] = r.unit_price > 0 ? r.unit_price : ((inventory || []).find((i: any) => i.id === r.item_id)?.unit_price || 0);
                                                                                    initialQuantities[r.id] = r.quantity_approved || r.management_reviewed_quantity || r.quantity_requested || 1;
                                                                                });
                                                                                setBatchItemPrices(initialPrices);
                                                                                setBatchItemQuantities(initialQuantities);
                                                                                setIsBatchQuoteOpen(true);
                                                                            }}
                                                                        >
                                                                            Batch PO
                                                                        </Button>

                                                                        <Button
                                                                            size="sm"
                                                                            className="h-8 bg-blue-900 hover:bg-blue-950 text-white text-[10px] font-bold uppercase rounded-lg shadow-xs"
                                                                            disabled={
                                                                                group.reqs.filter((r: any) => r.unit_price > 0 && r.supplier_id).length === 0 || 
                                                                                submitModelBatchMutation.isPending
                                                                            }
                                                                            onClick={() => {
                                                                                const draftReqs = group.reqs.filter((r: any) => r.unit_price > 0 && r.supplier_id);
                                                                                if (draftReqs.length > 0) {
                                                                                    const existingPo = draftReqs.find((r: any) => r.po_number)?.po_number;
                                                                                    const poNumToUse = existingPo || generatePONumber(requisitions?.filter((r: any) => new Date(r.created_at).toDateString() === new Date().toDateString() && r.po_number).length || 0);
                                                                                    submitModelBatchMutation.mutate({
                                                                                        reqIds: draftReqs.map((r: any) => r.id),
                                                                                        poNumber: poNumToUse
                                                                                    });
                                                                                }
                                                                            }}
                                                                        >
                                                                            {submitModelBatchMutation.isPending ? "Submitting..." : `Send PO (${group.reqs.filter((r: any) => r.unit_price > 0 && r.supplier_id).length})`}
                                                                        </Button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Items List (Clean Card Layout) */}
                                                    {isExpanded && (
                                                        <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                                            {group.reqs.map((req: any, rIdx: number) => {
                                                                const qtyApproved = req.quantity_approved || req.management_reviewed_quantity || req.quantity_requested || 1;
                                                                const unitPrice = req.unit_price > 0 ? req.unit_price : ((inventory || []).find((i: any) => i.id === req.item_id)?.unit_price || 0);
                                                                const lineBase = qtyApproved * unitPrice;
                                                                const lineDisc = lineBase * ((req.discount_percentage || 0) / 100);
                                                                const lineVat = req.includes_vat ? ((lineBase - lineDisc) * 0.18) : 0;
                                                                const lineTotal = req.total_price && Number(req.total_price) > 0 ? Number(req.total_price) : (lineBase - lineDisc + lineVat);

                                                                const isSelected = selectedRequisitionIds.includes(req.id);

                                                                return (
                                                                    <div
                                                                        key={req.id}
                                                                        className={cn(
                                                                            "relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-5 overflow-hidden",
                                                                            isSelected ? "ring-2 ring-blue-500 bg-blue-50/20" : ""
                                                                        )}
                                                                    >
                                                                        {/* Status Accent Bar */}
                                                                        <div
                                                                            className={cn(
                                                                                "absolute left-0 top-0 bottom-0 w-1.5",
                                                                                req.status === 'Pending' || req.status === 'Pending Review' || req.status === 'Revoked' ? 'bg-amber-400' :
                                                                                req.status === 'Awaiting Approval' ? 'bg-purple-500' :
                                                                                req.status === 'Approved' ? 'bg-blue-600' :
                                                                                req.status === 'Purchased' || req.status === 'Paid' || req.status === 'Delivered' || req.status === 'Arrived' ? 'bg-emerald-500' :
                                                                                'bg-slate-300'
                                                                            )}
                                                                        />

                                                                        {/* 1. Item Identification & Vehicle Details */}
                                                                        <div className="flex items-start gap-3.5 flex-1 min-w-[280px]">
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <Checkbox
                                                                                    checked={isSelected}
                                                                                    onCheckedChange={(checked) => {
                                                                                        if (checked) {
                                                                                            setSelectedRequisitionIds(prev => [...prev, req.id]);
                                                                                        } else {
                                                                                            setSelectedRequisitionIds(prev => prev.filter(id => id !== req.id));
                                                                                        }
                                                                                    }}
                                                                                />
                                                                                <span className="text-[10px] font-black text-slate-300 tabular-nums">
                                                                                    {(rIdx + 1).toString().padStart(2, '0')}
                                                                                </span>
                                                                            </div>

                                                                            <div className="space-y-1.5 flex-1">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                                        <Package size={14} className="text-blue-900" />
                                                                                        {req.item_name}
                                                                                    </span>

                                                                                    {req.vehicle && (
                                                                                        <Badge variant="outline" className="text-[10px] font-bold border-slate-200 text-slate-700 bg-slate-50 gap-1 rounded">
                                                                                            <Truck size={11} className="text-blue-700" />
                                                                                            <span>{req.vehicle.vehicle_no || req.vehicle.horse_number || req.vehicle.trailer_number || 'VEHICLE'}</span>
                                                                                            {req.vehicle.make_model && (
                                                                                                <span className="text-slate-400 font-normal">({req.vehicle.make_model})</span>
                                                                                            )}
                                                                                        </Badge>
                                                                                    )}

                                                                                    {req.target_company && (
                                                                                        <Badge variant="outline" className="text-[9px] font-bold border-slate-200 text-slate-600 bg-white uppercase">
                                                                                            {getDepartmentName(req.target_company)}
                                                                                        </Badge>
                                                                                    )}

                                                                                    {req.requirement_category && (
                                                                                        <Badge variant="outline" className="text-[9px] font-bold border-indigo-200 text-indigo-700 bg-indigo-50/50 uppercase">
                                                                                            {req.requirement_category}
                                                                                        </Badge>
                                                                                    )}

                                                                                    {req.is_emergency && (
                                                                                        <Badge variant="destructive" className="text-[9px] font-bold uppercase animate-pulse">
                                                                                            EMERGENCY
                                                                                        </Badge>
                                                                                    )}

                                                                                    {getStatusBadge(req.status, req)}
                                                                                </div>

                                                                                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                                                                    {/* PO Number Badge */}
                                                                                    {req.po_number ? (
                                                                                        <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-mono font-bold">
                                                                                            PO: {req.po_number}
                                                                                        </Badge>
                                                                                    ) : (
                                                                                        <span className="text-[10px] font-mono text-slate-400 italic">
                                                                                            -- No PO Generated --
                                                                                        </span>
                                                                                    )}

                                                                                    <span className="text-slate-300">•</span>

                                                                                    {/* Requester & Date */}
                                                                                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                                                                        <span>Req by: <strong className="text-slate-700">{req.profiles?.full_name || 'Workshop Team'}</strong></span>
                                                                                        <span>• {formatDate(req.created_at)}</span>
                                                                                    </div>

                                                                                    {/* Attached Photos */}
                                                                                    {req.image_url && (
                                                                                        <>
                                                                                            <span className="text-slate-300">•</span>
                                                                                            <div className="flex items-center gap-1">
                                                                                                {req.image_url.split(',').filter(Boolean).map((url: string, i: number) => (
                                                                                                    <a
                                                                                                        key={i}
                                                                                                        href={url}
                                                                                                        target="_blank"
                                                                                                        rel="noopener noreferrer"
                                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                                        className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100 transition-colors"
                                                                                                    >
                                                                                                        <FileText size={10} /> Photo {i + 1}
                                                                                                    </a>
                                                                                                ))}
                                                                                            </div>
                                                                                        </>
                                                                                    )}
                                                                                </div>

                                                                                {/* Boss Review Note */}
                                                                                {req.management_review_note && (
                                                                                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 text-[11px] text-amber-900 italic w-fit mt-1">
                                                                                        <span className="font-bold mr-1 not-italic">Boss Note:</span>
                                                                                        {req.management_review_note}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* 2. Quantities & Financial Breakdown */}
                                                                        <div className="flex items-center justify-between xl:justify-end gap-6 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 xl:pl-6 w-full xl:w-auto">
                                                                            <div className="space-y-0.5 min-w-[100px]">
                                                                                <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Quantity</span>
                                                                                <div className="text-xs font-black text-slate-800">
                                                                                    {req.quantity_approved || req.quantity_requested} Units
                                                                                </div>
                                                                                <div className="text-[10px] text-slate-400 font-medium">
                                                                                    Req: {req.original_quantity || req.quantity_requested}
                                                                                </div>
                                                                            </div>

                                                                            <div className="space-y-0.5 pl-4 border-l border-slate-100 min-w-[100px]">
                                                                                <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Unit Price</span>
                                                                                <div className="text-xs font-black text-slate-800">
                                                                                    {formatTSh(unitPrice)}
                                                                                </div>
                                                                                <span className="text-[10px] text-slate-400 font-medium block">
                                                                                    {req.includes_vat ? "Inc. VAT" : "Ex. VAT"}
                                                                                </span>
                                                                            </div>

                                                                            <div className="space-y-0.5 pl-4 border-l border-slate-100 text-right min-w-[110px]">
                                                                                <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Total Value</span>
                                                                                <div className="text-xs font-black text-blue-900 leading-none">
                                                                                    {formatTSh(lineTotal)}
                                                                                </div>
                                                                                <span className="text-[10px] text-emerald-600 font-bold block">
                                                                                    Line Total
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {/* 3. Action Buttons */}
                                                                        <div className="flex items-center gap-2 pl-0 xl:pl-4 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 w-full xl:w-auto flex-wrap sm:flex-nowrap justify-end">
                                                                            {/* Admin quick edit & delete */}
                                                                            {(userRole === 'admin' || userRole === 'super_admin') && (
                                                                                <>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                                                                        title="Admin Quick Edit"
                                                                                        onClick={() => {
                                                                                            setQuickEditData({
                                                                                                id: req.id,
                                                                                                item_name: req.item_name,
                                                                                                quantity_requested: req.quantity_requested || 0,
                                                                                                quantity_approved: req.quantity_approved || 0,
                                                                                                unit_price: req.unit_price || 0,
                                                                                                pack_size: req.pack_size || 1
                                                                                            });
                                                                                            setIsQuickEditOpen(true);
                                                                                        }}
                                                                                    >
                                                                                        <Pencil size={13} />
                                                                                    </Button>

                                                                                    <Button 
                                                                                        variant="ghost" 
                                                                                        size="sm" 
                                                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                                                        title="Delete Requisition"
                                                                                        disabled={deleteRequisitionGroupMutation.isPending}
                                                                                        onClick={() => {
                                                                                            if (window.confirm(`Are you sure you want to delete this requisition? This will remove it from the system entirely.`)) {
                                                                                                deleteRequisitionGroupMutation.mutate([req.id]);
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <Trash2 size={13} />
                                                                                    </Button>
                                                                                </>
                                                                            )}

                                                                            {/* Enter / Review Quote */}
                                                                            {(req.status === 'Pending' || req.status === 'Pending Review' || req.status === 'Revoked') && (
                                                                                <Button
                                                                                    size="sm"
                                                                                    className="h-8 px-3 bg-blue-900 hover:bg-blue-950 text-white text-[10px] font-bold uppercase rounded-lg shadow-xs"
                                                                                    onClick={() => {
                                                                                        setSelectedReq(req);
                                                                                        setApprovalDetails({
                                                                                            supplier_id: req.supplier_id || "",
                                                                                            po_number: req.po_number || generatePONumber(requisitions?.filter((r: any) =>
                                                                                                new Date(r.created_at).toDateString() === new Date().toDateString() && r.po_number
                                                                                            ).length || 0),
                                                                                            includes_vat: req.includes_vat || false,
                                                                                            vat_amount: req.vat_amount || 0,
                                                                                            temp_price: req.unit_price || (inventory || []).find((i: any) => i.id === req.item_id)?.unit_price || 0,
                                                                                            payment_method_id: req.payment_details?.id || "",
                                                                                            quantity_approving: req.quantity_requested || 0,
                                                                                            pack_size: req.pack_size || 1
                                                                                        });
                                                                                        setIsApproveDialogOpen(true);
                                                                                    }}
                                                                                >
                                                                                    {userRole === 'procurement_officer' ? "Enter Quote" : "Review Quote"}
                                                                                </Button>
                                                                            )}

                                                                            {/* Management Approval */}
                                                                            {req.status === 'Awaiting Approval' && (userRole === 'admin' || userRole === 'super_admin') && (
                                                                                <Button
                                                                                    size="sm"
                                                                                    className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase rounded-lg shadow-xs gap-1"
                                                                                    onClick={() => {
                                                                                        setSelectedReq(req);
                                                                                        setApprovalDetails({
                                                                                            supplier_id: req.supplier_id || "",
                                                                                            po_number: req.po_number || generatePONumber(),
                                                                                            includes_vat: req.includes_vat || false,
                                                                                            vat_amount: req.vat_amount || 0,
                                                                                            temp_price: req.unit_price || 0,
                                                                                            payment_method_id: req.payment_details?.id || "",
                                                                                            quantity_approving: req.quantity_requested || 0,
                                                                                            pack_size: req.pack_size || 1
                                                                                        });
                                                                                        setIsApproveDialogOpen(true);
                                                                                    }}
                                                                                >
                                                                                    <ShieldCheck size={12} />
                                                                                    Approve Line
                                                                                </Button>
                                                                            )}

                                                                            {/* Mark as Paid */}
                                                                            {req.status === 'Approved' && (userRole === 'finance' || userRole === 'super_admin' || userRole === 'admin') && (
                                                                                <Button
                                                                                    size="sm"
                                                                                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded-lg shadow-xs"
                                                                                    onClick={() => {
                                                                                        workflowMutation.mutate({
                                                                                            reqId: req.id,
                                                                                            qty: req.quantity_approved,
                                                                                            itemId: req.item_id,
                                                                                            details: { ...req, payment_method_id: req.payment_details?.id },
                                                                                            nextStatus: 'Paid'
                                                                                        });
                                                                                    }}
                                                                                >
                                                                                    Mark as Paid
                                                                                </Button>
                                                                            )}

                                                                            {/* Print PO */}
                                                                            {req.po_number && (
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="h-8 px-2.5 text-[10px] font-bold uppercase border-slate-200 hover:bg-slate-50 rounded-lg"
                                                                                    onClick={() => printPurchaseOrder({ reqId: req.id })}
                                                                                >
                                                                                    <Printer size={12} />
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </Card>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Floating Grouped Actions Bar */}
                    {
                        selectedRequisitionIds.length > 0 && (
                            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 backdrop-blur-md bg-opacity-95">
                                    <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
                                        <div className="w-6 h-6 rounded-full bg-blue-900 text-white text-[10px] font-semibold flex items-center justify-center">
                                            {selectedRequisitionIds.length}
                                        </div>
                                        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Items Selected</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-slate-400 hover:text-white hover:bg-slate-800 text-[10px] font-semibold uppercase"
                                            onClick={() => setSelectedRequisitionIds([])}
                                        >
                                            Deselect All
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="bg-blue-900 hover:bg-black text-white text-[10px] font-semibold uppercase px-6 h-9 rounded-full shadow-lg shadow-blue-900/10"
                                            onClick={() => {
                                                const selectedReqs = (requisitions || []).filter((r: any) => selectedRequisitionIds.includes(r.id));
                                                if (selectedReqs.length === 0) return;

                                                // Open Batch Review & Quote modal directly — grouped by Supplier
                                                const initialPrices: Record<string, number> = {};
                                                const initialQuantities: Record<string, number> = {};
                                                selectedReqs.forEach((req: any) => {
                                                    initialPrices[req.id] = req.unit_price || 0;
                                                    initialQuantities[req.id] = req.quantity_approved || req.quantity_requested || 1;
                                                });

                                                setBatchQuoteReqs(selectedReqs);
                                                setBatchSharedDetails({
                                                    supplier_id: "",
                                                    po_number: generatePONumber(requisitions?.filter((r: any) => new Date(r.created_at).toDateString() === new Date().toDateString() && r.po_number).length || 0),
                                                    includes_vat: false,
                                                    payment_method_id: "",
                                                    discount_percentage: 0,
                                                    advance_payment: 0
                                                });
                                                setBatchItemPrices(initialPrices);
                                                setBatchItemQuantities(initialQuantities);
                                                setIsBatchQuoteOpen(true);
                                            }}
                                        >
                                            <FileCheck className="w-4 h-4 mr-2" />
                                            Generate Grouped PO
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )
                    }
                </TabsContent >

                <TabsContent value="inventory" className="mt-6">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-900 border-b pb-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xs font-semibold text-white uppercase tracking-widest flex items-center gap-2">
                                    <Package className="w-4 h-4 text-indigo-400" /> Professional Stock Control
                                </CardTitle>
                            </div>
                            <div className="relative w-64">
                                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-500" />
                                <Input
                                    placeholder="Find items..."
                                    className="pl-8 h-8 text-[11px] bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                                    value={inventorySearch}
                                    onChange={(e) => setInventorySearch(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b bg-slate-50/50">
                                        <TableHead className="text-xs font-semibold uppercase py-4">Item Description</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Category</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Current Stock</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Unit Price (TZS)</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Threshold</TableHead>
                                        <TableHead className="text-right text-xs font-semibold uppercase px-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(inventory || []).filter((i: any) =>
                                        i.item_name.toLowerCase().includes(inventorySearch.toLowerCase())
                                    ).map((item: any) => (
                                        <TableRow key={item.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-semibold text-slate-700">{item.item_name}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-[10px] font-semibold uppercase">{item.category}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={(item.quantity || 0) <= (item.min_threshold || 0) ? "bg-red-50 text-red-700 border-red-100" : "bg-green-50 text-green-700 border-green-100"} variant="outline">
                                                    {item.quantity} units
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-semibold text-blue-900">
                                                {item.unit_price?.toLocaleString()} TZS
                                            </TableCell>
                                            <TableCell className="text-slate-400 text-xs">Min: {item.min_threshold || 0}</TableCell>
                                            <TableCell className="text-right px-6">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-xs font-semibold uppercase text-blue-900"
                                                    onClick={() => {
                                                        setSelectedInventoryItem(item);
                                                        setUpdatePriceDetails({
                                                            unit_price: item.unit_price || 0
                                                        });
                                                        setIsUpdatePriceOpen(true);
                                                    }}
                                                >Update Price</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="suppliers" className="mt-6">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 bg-slate-50/50">
                    <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-slate-700">Supplier Directory</CardTitle>
                    <Button onClick={() => setIsAddSupplierOpen(true)} className="h-8 bg-blue-900 text-[10px] font-semibold uppercase"><Plus className="w-3 h-3 mr-2" /> Add Supplier</Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b">
                                        <TableHead className="text-[11px] font-semibold uppercase">Supplier Name</TableHead>
                                        <TableHead className="text-[11px] font-semibold uppercase">Contact Person</TableHead>
                                        <TableHead className="text-[11px] font-semibold uppercase">Phone/Email</TableHead>
                                        <TableHead className="text-[11px] font-semibold uppercase">Specialty</TableHead>
                                        <TableHead className="text-right text-[11px] font-semibold uppercase px-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(suppliers || []).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-40 text-center text-slate-400 italic">No suppliers registered. Add one to link purchases.</TableCell>
                                        </TableRow>
                                    ) : (suppliers || []).map((s: any) => (
                                        <React.Fragment key={s.id}>
                                            <TableRow className={expandedSupplierId === s.id ? "bg-slate-50/50" : ""}>
                                                <TableCell className="font-semibold text-slate-700">
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 hover:bg-slate-200"
                                                            onClick={() => setExpandedSupplierId(expandedSupplierId === s.id ? null : s.id)}
                                                        >
                                                            {expandedSupplierId === s.id ? <ChevronDown className="w-4 h-4 text-blue-900" /> : <ArrowRight className="w-4 h-4 text-slate-400" />}
                                                        </Button>
                                                        {s.name}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm">{s.contact_person}</TableCell>
                                                <TableCell className="text-[11px] text-slate-500">{s.phone} / {s.email}</TableCell>
                                                <TableCell><Badge variant="outline" className="text-[10px] font-semibold uppercase">{s.category}</Badge></TableCell>
                                                <TableCell className="text-right px-6">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={`h-8 text-[10px] font-semibold uppercase border-blue-100 ${expandedSupplierId === s.id ? 'bg-blue-900 text-white hover:bg-black' : 'text-blue-900 hover:bg-blue-50'}`}
                                                            onClick={() => setExpandedSupplierId(expandedSupplierId === s.id ? null : s.id)}
                                                        >
                                                            {expandedSupplierId === s.id ? 'Hide Accounts' : 'View Accounts'}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-slate-400 hover:text-blue-900"
                                                            onClick={() => {
                                                                setEditingSupplier(s);
                                                                const phones = s.phone ? s.phone.split(",").map((p: string) => p.trim()) : ["", ""];
                                                                setEditPhones(phones.length >= 2 ? phones : [...phones, ""]);
                                                                setIsEditSupplierOpen(true);
                                                            }}
                                                        >
                                                            <FileCheck className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                                            onClick={() => setSupplierToDelete(s)}
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 text-[10px] font-semibold uppercase border-blue-100 text-blue-900 hover:bg-blue-50"
                                                            onClick={() => {
                                                                setSelectedSupplierForPayment(s);
                                                                setIsAddPaymentMethodOpen(true);
                                                            }}
                                                        >
                                                            <Plus className="w-3 h-3 mr-1" /> Add Payment info
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                            {/* Expandable Payment Methods Section */}
                                            {expandedSupplierId === s.id && (
                                                <TableRow className="bg-slate-50/30 border-t-0">
                                                    <TableCell colSpan={5} className="p-0">
                                                        <div className="p-6 pt-2 pb-8 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <div className="flex items-center justify-between mb-4 border-b pb-2 border-slate-200/60">
                                                                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                                                    <Building2 className="w-3 h-3" /> Registered Accounts for {s.name}
                                                                </h4>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                {(allPaymentMethods || []).filter((pm: any) => pm.supplier_id === s.id).length === 0 ? (
                                                                    <div className="col-span-3 py-8 text-center bg-white/50 rounded-lg border border-dashed border-slate-200">
                                                                        <p className="text-[11px] text-slate-400 italic">No payment accounts found for this supplier.</p>
                                                                        <Button 
                                                                            variant="link" 
                                                                            className="text-[10px] font-bold uppercase text-blue-900"
                                                                            onClick={() => {
                                                                                setSelectedSupplierForPayment(s);
                                                                                setIsAddPaymentMethodOpen(true);
                                                                            }}
                                                                        >
                                                                            + Create First Account
                                                                        </Button>
                                                                    </div>
                                                                ) : (allPaymentMethods || []).filter((pm: any) => pm.supplier_id === s.id).map((pm: any) => (
                                                                    <div key={pm.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-start gap-3 group relative hover:border-blue-200 transition-colors">
                                                                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-blue-900">
                                                                            {pm.method_type === 'Bank' ? <Building2 className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <div className="flex justify-between items-start">
                                                                                <p className="text-[10px] font-semibold text-slate-400 uppercase">{pm.method_type}</p>
                                                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-6 w-6 p-0 text-slate-400 hover:text-blue-900"
                                                                                        onClick={() => {
                                                                                            setEditingPaymentMethod(pm);
                                                                                            setIsEditPaymentMethodOpen(true);
                                                                                        }}
                                                                                    >
                                                                                        <FileCheck className="w-3 h-3" />
                                                                                    </Button>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                                                                                        onClick={() => {
                                                                                            if (confirm("Delete this payment method?")) {
                                                                                                deletePaymentMethodMutation.mutate(pm.id);
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <XCircle className="w-3 h-3" />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                            <p className="text-xs font-bold text-slate-800">{pm.method_type === 'Mobile Money' ? 'Network' : 'Bank'}: {pm.bank_name || 'N/A'}</p>
                                                                            <p className="text-[11px] text-slate-600 font-mono font-bold bg-slate-50 px-2 py-0.5 rounded mt-1 inline-block">
                                                                                {pm.method_type === 'Mobile Money' ? 'Lipa #' : 'Acc #'}: {pm.account_number}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="arrivals" className="mt-6">
                    <Card className="border-none shadow-sm bg-white">
                        <CardHeader className="bg-slate-50/50 border-b pb-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <Truck className="w-5 h-5 text-blue-900" />
                                        Pending Arrivals
                                    </CardTitle>
                                    <p className="text-xs text-slate-500 mt-1">Items fully paid and expected for store receipt.</p>
                                </div>
                                <Badge className="bg-blue-900 text-white border-none">
                                    {(requisitions || []).filter((r: any) => r.status === 'Paid').length} Expected
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow className="border-none">
                                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 pl-6">Item & PO</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold text-slate-500">Paid Qty</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold text-slate-500">Supplier</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold text-slate-500">Vehicle</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(requisitions || []).filter((r: any) => r.status === 'Paid').length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">No pending arrivals found.</TableCell>
                                        </TableRow>
                                    ) : (
                                        (requisitions || []).filter((r: any) => r.status === 'Paid').map((req: any) => (
                                            <TableRow key={req.id} className="hover:bg-slate-50/50 transition-colors border-slate-50">
                                                <TableCell className="pl-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800">{req.item_name}</span>
                                                        <span className="font-mono text-[10px] text-blue-700">{req.po_number}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="font-bold bg-white text-blue-900 border-blue-100">
                                                        {req.quantity_approved} Units
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-xs font-semibold text-slate-700">{req.garage_suppliers?.name || 'Manual Supplier'}</span>
                                                </TableCell>
                                                <TableCell>
                                                    {req.vehicle && (
                                                        <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">
                                                            <div className="flex flex-col leading-tight"><span>{req.vehicle.vehicle_no || req.vehicle.horse_number}</span>{req.vehicle.make_model && <span className="text-[10px] text-slate-500 font-medium">{req.vehicle.make_model}</span>}</div>
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {req.payment_receipt_url && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-[9px] font-bold uppercase border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                                onClick={() => {
                                                                    setViewReceiptUrl(req.payment_receipt_url);
                                                                    setReceiptViewerTitle("Payment Receipt");
                                                                    setIsReceiptViewerOpen(true);
                                                                }}
                                                            >
                                                                <Eye className="w-3 h-3 mr-1" />
                                                                Payment Receipt
                                                            </Button>
                                                        )}
                                                        {req.delivery_receipt_url ? (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-[9px] font-bold uppercase border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                                                onClick={() => {
                                                                    setViewReceiptUrl(req.delivery_receipt_url);
                                                                    setReceiptViewerTitle("Shop Receipt");
                                                                    setIsReceiptViewerOpen(true);
                                                                }}
                                                            >
                                                                <Eye className="w-3 h-3 mr-1" />
                                                                Shop Receipt
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-[9px] font-bold uppercase border-amber-200 text-amber-700 hover:bg-amber-50"
                                                                onClick={() => {
                                                                    setUploadingShopReceiptId(req.id);
                                                                    shopReceiptInputRef.current?.click();
                                                                }}
                                                            >
                                                                <Upload className="w-3 h-3 mr-1" />
                                                                Upload Shop Receipt
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            className="h-7 bg-emerald-600 hover:bg-emerald-700 text-[9px] font-bold uppercase"
                                                            onClick={() => {
                                                                setReceivingItem(req);
                                                                setReceivingQuantity(req.quantity_approved);
                                                                setReceivingNote("");
                                                                setIsReceiveDialogOpen(true);
                                                            }}
                                                        >
                                                            Mark as Arrived
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs >

            {/* Batch Quote Dialog */}
            <Dialog open={isBatchQuoteOpen} onOpenChange={setIsBatchQuoteOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-blue-900" />
                            Batch Review & Quote ({batchQuoteReqs.length} Items)
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-6 py-4">
                        {/* Shared Details */}
                        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Supplier</Label>
                                <Popover open={batchSupplierOpen} onOpenChange={setBatchSupplierOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={batchSupplierOpen}
                                            className="w-full justify-between h-9 text-xs font-normal"
                                        >
                                            {batchSharedDetails.supplier_id
                                                ? (suppliers || []).find((s: any) => s.id === batchSharedDetails.supplier_id)?.name
                                                : "Choose Supplier..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search supplier..." />
                                            <CommandList>
                                                <CommandEmpty>No supplier found.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        key="none"
                                                        value="None (Unassign Supplier)"
                                                        onSelect={() => {
                                                            setBatchSharedDetails({ ...batchSharedDetails, supplier_id: "", payment_method_id: "" });
                                                            setBatchSupplierOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={`mr-2 h-4 w-4 ${!batchSharedDetails.supplier_id ? "opacity-100" : "opacity-0"}`}
                                                        />
                                                        <span className="italic text-slate-500">None (Unassign Supplier)</span>
                                                    </CommandItem>
                                                    {(suppliers || []).map((s: any) => (
                                                        <CommandItem
                                                            key={s.id}
                                                            value={s.name}
                                                            onSelect={() => {
                                                                setBatchSharedDetails({ ...batchSharedDetails, supplier_id: s.id, payment_method_id: "" });
                                                                setBatchSupplierOpen(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={`mr-2 h-4 w-4 ${batchSharedDetails.supplier_id === s.id ? "opacity-100" : "opacity-0"}`}
                                                            />
                                                            {s.name}
                                                        </CommandItem>
                                                    ))}
                                                    <div className="p-1 mt-1 border-t border-slate-100">
                                                        <Button
                                                            variant="ghost"
                                                            className="w-full justify-start text-[11px] h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setQuickAddSupplierOpen(true);
                                                            }}
                                                        >
                                                            <Plus className="mr-2 h-3 w-3" />
                                                            Add New Supplier
                                                        </Button>
                                                    </div>
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Payment Mode</Label>
                                <Select
                                    value={batchSharedDetails.payment_method_id}
                                    onValueChange={(val) => {
                                        if (val === "add_new") {
                                            setQuickAddAccountOpen(true);
                                            // Reset value so it doesn't stay on 'add_new'
                                            setBatchSharedDetails({ ...batchSharedDetails, payment_method_id: "" });
                                        } else {
                                            setBatchSharedDetails({ ...batchSharedDetails, payment_method_id: val })
                                        }
                                    }}
                                    disabled={!batchSharedDetails.supplier_id}
                                >
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue placeholder="Choose Account..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(allPaymentMethods || [])
                                            .filter((m: any) => m.supplier_id === batchSharedDetails.supplier_id || m.type === 'Cash')
                                            .map((m: any) => (
                                                <SelectItem key={m.id} value={m.id} className="text-[11px]">
                                                    {m.method_type || m.type}: {m.bank_name || ''} {m.account_number ? `(${m.account_number})` : ''}
                                                </SelectItem>
                                            ))}
                                        {batchSharedDetails.supplier_id && (
                                            <SelectItem value="add_new" className="text-[11px] text-blue-600 font-medium focus:text-blue-700 focus:bg-blue-50">
                                                + Add New Account
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">PO Number</Label>
                                <Input
                                    value={batchSharedDetails.po_number}
                                    onChange={(e) => setBatchSharedDetails({ ...batchSharedDetails, po_number: e.target.value })}
                                    className="h-9 font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Discount (%)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={batchSharedDetails.discount_percentage}
                                    onChange={(e) => setBatchSharedDetails({ ...batchSharedDetails, discount_percentage: parseFloat(e.target.value) || 0 })}
                                    className="h-9 font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-2 flex flex-col justify-end">
                                <div className="flex items-center gap-2 border p-2 rounded-md bg-white">
                                    <Switch
                                        checked={batchSharedDetails.includes_vat}
                                        onCheckedChange={(val) => setBatchSharedDetails({ ...batchSharedDetails, includes_vat: val })}
                                        id="batch-vat"
                                    />
                                    <Label htmlFor="batch-vat" className="text-[11px] font-semibold cursor-pointer">Include VAT (18%)</Label>
                                </div>
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="space-y-3">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase border-b pb-1 flex justify-between">
                                <span>Items to Quote</span>
                                <span>{batchQuoteReqs.length}</span>
                            </Label>
                            {batchQuoteReqs.map((req) => {
                                const balance = (req.quantity_requested || 0) - (req.quantity_received || 0);
                                const hasPartialReceipt = (req.quantity_received || 0) > 0;
                                return (
                                <div key={req.id} className="flex items-center gap-4 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                                    <div className="flex-1">
                                        <p className="font-bold text-sm text-slate-800">{req.item_name}</p>
                                        <p className="text-[10px] text-slate-500 uppercase">Requested: {req.quantity_requested}</p>
                                        {hasPartialReceipt && (
                                            <p className="text-[10px] font-bold text-amber-600 uppercase">Received: {req.quantity_received} &nbsp;|&nbsp; Balance: {balance}</p>
                                        )}
                                    </div>
                                    <div className="w-24 space-y-1">
                                        <Label className="text-[9px] text-slate-500 uppercase">Qty to Buy</Label>
                                        <Input
                                            type="number"
                                            value={batchItemQuantities[req.id] || ''}
                                            onChange={(e) => setBatchItemQuantities({ ...batchItemQuantities, [req.id]: parseInt(e.target.value) || 0 })}
                                            className="h-8 font-semibold text-center"
                                            min={1}
                                        />
                                    </div>
                                    <div className="w-32 space-y-1">
                                        <Label className="text-[9px] text-slate-500 uppercase">Unit Price</Label>
                                        <Input
                                            type="number"
                                            value={batchItemPrices[req.id] || ''}
                                            onChange={(e) => setBatchItemPrices({ ...batchItemPrices, [req.id]: parseFloat(e.target.value) || 0 })}
                                            className="h-8 font-semibold text-right"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="w-24 text-right">
                                        <p className="text-[9px] text-slate-500 uppercase mb-1">Subtotal</p>
                                        <p className="font-bold text-sm">
                                            {((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                );
                            })}

                        </div>

                        {/* Totals */}
                        <div className="border-t pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Subtotal:</span>
                                <span className="font-semibold">
                                    {batchQuoteReqs.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0).toLocaleString()} TZS
                                </span>
                            </div>
                            {batchSharedDetails.discount_percentage > 0 && (
                                <div className="flex justify-between text-sm text-green-700 font-medium">
                                    <span>Discount ({batchSharedDetails.discount_percentage}%):</span>
                                    <span>
                                        -{ (batchQuoteReqs.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (batchSharedDetails.discount_percentage / 100)).toLocaleString() } TZS
                                    </span>
                                </div>
                            )}
                            {batchSharedDetails.includes_vat && (
                                <div className="flex justify-between text-sm text-blue-900 font-medium">
                                    <span>VAT (18%):</span>
                                    <span>
                                        {((batchQuoteReqs.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * 0.18).toLocaleString()} TZS
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-black border-t pt-2">
                                <span>TOTAL:</span>
                                <span>
                                    {((batchQuoteReqs.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * (batchSharedDetails.includes_vat ? 1.18 : 1)).toLocaleString()} TZS
                                </span>
                            </div>

                            {/* Advance Payment Section */}
                            <div className="mt-3 pt-3 border-t border-dashed border-slate-300 space-y-2 bg-slate-50 p-3 rounded-lg">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <Label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                            Advance Payment (Optional)
                                        </Label>
                                        <p className="text-[11px] text-slate-500">Leave at 0 for 100% full payment</p>
                                    </div>
                                    <div className="relative w-48">
                                        <Input
                                            type="number"
                                            min="0"
                                            max={((batchQuoteReqs.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * (batchSharedDetails.includes_vat ? 1.18 : 1))}
                                            placeholder="0"
                                            className="font-bold text-right pr-12 h-9 bg-white"
                                            value={batchSharedDetails.advance_payment || ""}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setBatchSharedDetails({ ...batchSharedDetails, advance_payment: Math.max(0, val) });
                                            }}
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">TZS</span>
                                    </div>
                                </div>
                                {batchSharedDetails.advance_payment > 0 && (
                                    <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs">
                                        <span className="font-semibold text-slate-600">Remaining Balance on Arrival:</span>
                                        <span className="font-bold text-amber-600 text-sm">
                                            {Math.max(0, (((batchQuoteReqs.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * (batchSharedDetails.includes_vat ? 1.18 : 1)) - batchSharedDetails.advance_payment)).toLocaleString()} TZS
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sticky bottom-0 bg-white p-4 border-t z-10 -mx-6 -mb-6 mt-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={() => setIsBatchQuoteOpen(false)} className="h-11 font-semibold uppercase text-[11px] flex-1">Cancel</Button>

                        <Button
                            variant="outline"
                            className="h-11 border-blue-200 text-blue-900 hover:bg-blue-50 font-semibold uppercase text-[11px] px-6 flex-1"
                            disabled={batchWorkflowMutation.isPending || batchQuoteReqs.some(r => !batchItemPrices[r.id] || batchItemPrices[r.id] <= 0 || !batchItemQuantities[r.id] || batchItemQuantities[r.id] <= 0)}
                            onClick={() => {
                                setSubmittingBatchType("update");
                                batchWorkflowMutation.mutate({
                                    reqs: batchQuoteReqs,
                                    sharedDetails: batchSharedDetails,
                                    itemPrices: batchItemPrices,
                                    itemQuantities: batchItemQuantities,
                                    isUpdateOnly: true
                                });
                            }}
                        >
                            {batchWorkflowMutation.isPending && submittingBatchType === "update" ? "Updating..." : "Update"}
                        </Button>

                        <Button
                            className="h-11 bg-blue-900 hover:bg-black font-semibold uppercase text-[11px] px-8 flex-1"
                            disabled={!batchSharedDetails.supplier_id || !batchSharedDetails.payment_method_id || batchWorkflowMutation.isPending || batchQuoteReqs.some(r => !batchItemPrices[r.id] || batchItemPrices[r.id] <= 0 || !batchItemQuantities[r.id] || batchItemQuantities[r.id] <= 0)}
                            onClick={() => {
                                setSubmittingBatchType("send");
                                batchWorkflowMutation.mutate({
                                    reqs: batchQuoteReqs,
                                    sharedDetails: batchSharedDetails,
                                    itemPrices: batchItemPrices,
                                    itemQuantities: batchItemQuantities
                                });
                            }}
                        >
                            {batchWorkflowMutation.isPending && submittingBatchType === "send" ? "Sending..." : "Send All for Approval"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Professional Approval Dialog */}
            < Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen} >
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-blue-900" />
                            {(selectedReq?.status === 'Pending' || selectedReq?.status === 'Pending Review' || selectedReq?.status === 'Revoked') ? 'Stage 1: Prepare Quote' : 'Stage 2: Management Approval'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">Planned PO Number</p>
                            <p className="font-mono text-lg font-semibold text-slate-900">{approvalDetails.po_number}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">Item</p>
                            <p className="font-semibold text-blue-900">{selectedReq?.item_name}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Select Supplier</Label>
                            <Popover open={singleSupplierOpen} onOpenChange={setSingleSupplierOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={singleSupplierOpen}
                                        className="w-full justify-between h-10 text-xs font-normal"
                                    >
                                        {approvalDetails.supplier_id
                                            ? (suppliers || []).find((s: any) => s.id === approvalDetails.supplier_id)?.name
                                            : "Choose Supplier..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search supplier..." />
                                        <CommandList>
                                            <CommandEmpty>No supplier found.</CommandEmpty>
                                            <CommandGroup>
                                                <CommandItem
                                                    key="none"
                                                    value="None (Unassign Supplier)"
                                                    onSelect={() => {
                                                        setApprovalDetails({ ...approvalDetails, supplier_id: "" });
                                                        setSingleSupplierOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${!approvalDetails.supplier_id ? "opacity-100" : "opacity-0"}`}
                                                    />
                                                    <span className="italic text-slate-500">None (Unassign Supplier)</span>
                                                </CommandItem>
                                                {(suppliers || []).map((s: any) => (
                                                    <CommandItem
                                                        key={s.id}
                                                        value={s.name}
                                                        onSelect={() => {
                                                            setApprovalDetails({ ...approvalDetails, supplier_id: s.id });
                                                            setSingleSupplierOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={`mr-2 h-4 w-4 ${approvalDetails.supplier_id === s.id ? "opacity-100" : "opacity-0"}`}
                                                        />
                                                        {s.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Available Quantity</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={selectedReq?.quantity_requested}
                                    value={approvalDetails.quantity_approving}
                                    onChange={(e) => setApprovalDetails({ ...approvalDetails, quantity_approving: parseInt(e.target.value) || 0 })}
                                    className="h-10 font-bold text-blue-900 border-blue-200 bg-blue-50/20"
                                />
                                <p className="text-[10px] text-slate-400 italic">Requested: {selectedReq?.quantity_requested}</p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Confirmed Unit Price</Label>
                                <Input
                                    type="number"
                                    value={approvalDetails.temp_price}
                                    onChange={(e) => setApprovalDetails({ ...approvalDetails, temp_price: parseFloat(e.target.value) || 0 })}
                                    className="h-10 font-semibold"
                                />
                                <p className="text-[10px] text-slate-400 italic">{approvalDetails.pack_size > 1 ? `Price per pack/can` : `Price per unit`}</p>
                            </div>
                        </div>

                        {/* Pack Size / Packaging support */}
                        <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50/40 rounded-lg border border-blue-100">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-blue-950 uppercase">Pack Size (Units/Pack)</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={approvalDetails.pack_size || 1}
                                    onChange={(e) => setApprovalDetails({ ...approvalDetails, pack_size: Math.max(1, parseInt(e.target.value) || 1) })}
                                    className="h-9 bg-white text-xs font-semibold"
                                    placeholder="1"
                                />
                                <p className="text-[10px] text-slate-500">e.g. 20 for 20L can</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-blue-950 uppercase">Packs to Buy</Label>
                                <div className="h-9 flex items-center justify-center font-black text-sm text-indigo-800 bg-white border border-blue-200 rounded-md">
                                    {Math.ceil(approvalDetails.quantity_approving / (approvalDetails.pack_size || 1))} {(approvalDetails.pack_size > 1) ? 'cans' : 'units'}
                                </div>
                                <p className="text-[10px] text-slate-500 text-center">
                                    {approvalDetails.quantity_approving} ÷ {approvalDetails.pack_size || 1}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Select Payment Mode</Label>
                            <Select
                                value={approvalDetails.payment_method_id}
                                onValueChange={(val) => setApprovalDetails({ ...approvalDetails, payment_method_id: val })}
                                disabled={!approvalDetails.supplier_id}
                            >
                                <SelectTrigger className="h-10 text-xs font-semibold border-blue-100">
                                    <SelectValue placeholder={approvalDetails.supplier_id ? "Choose Account..." : "Select Supplier first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(allPaymentMethods || [])
                                        .filter((m: any) => m.supplier_id === approvalDetails.supplier_id)
                                        .map((m: any) => (
                                            <SelectItem key={m.id} value={m.id} className="text-[11px]">
                                                {m.method_type}: {m.bank_name || ''} ({m.account_number})
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            {!approvalDetails.payment_method_id && approvalDetails.supplier_id && (
                                <p className="text-[10px] text-amber-600 font-medium italic">⚠️ Please select a payment account to link to this PO.</p>
                            )}
                        </div>

                        <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold">Include VAT (18%)</Label>
                                <p className="text-[10px] text-slate-500 italic">
                                    Tax will be added to the total valuation.
                                    {(!!selectedReq?.po_number || !!selectedReq?.supplier_id) && <span className="text-amber-600 ml-1">(Disabled: Handled by Batch PO)</span>}
                                </p>
                            </div>
                            <Switch
                                checked={approvalDetails.includes_vat}
                                disabled={!!selectedReq?.po_number || !!selectedReq?.supplier_id}
                                onCheckedChange={(val) => setApprovalDetails({ ...approvalDetails, includes_vat: val })}
                            />
                        </div>

                        {(() => {
                            const packSize = Math.max(1, approvalDetails.pack_size || 1);
                            const purchaseQty = Math.ceil(approvalDetails.quantity_approving / packSize);
                            const subtotal = purchaseQty * approvalDetails.temp_price;
                            const vat = approvalDetails.includes_vat ? subtotal * 0.18 : 0;
                            const total = subtotal + vat;

                            return (
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">
                                            Subtotal {packSize > 1 ? `(${purchaseQty} cans × ${approvalDetails.temp_price.toLocaleString()})` : `(${approvalDetails.quantity_approving} units × ${approvalDetails.temp_price.toLocaleString()})`}:
                                        </span>
                                        <span className="font-semibold">{subtotal.toLocaleString()} TZS</span>
                                    </div>
                                    {approvalDetails.includes_vat && (
                                        <div className="flex justify-between text-sm text-blue-900 font-medium">
                                            <span>VAT (18%):</span>
                                            <span>{vat.toLocaleString()} TZS</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-lg font-black border-t pt-2">
                                        <span>TOTAL:</span>
                                        <span className="text-indigo-900">{total.toLocaleString()} TZS</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Revoke Reason for Management */}
                    {(selectedReq?.status === 'Awaiting Approval' && (userRole === 'admin' || userRole === 'super_admin')) && (
                        <div className="space-y-2 pt-2 border-t mt-2">
                            <Label className="text-[11px] font-semibold text-rose-600 uppercase">Revoke Reason (Only if rejecting)</Label>
                            <textarea
                                className="w-full min-h-[60px] p-2 text-xs border border-rose-100 rounded-md bg-rose-50/20 focus:outline-none focus:ring-1 focus:ring-rose-500"
                                placeholder="Enter reason for revocation..."
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                            />
                        </div>
                    )}
                    <DialogFooter className="gap-2 sticky bottom-0 bg-white p-4 border-t z-10 -mx-6 -mb-6 mt-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)} className="h-11 font-semibold uppercase text-[11px] flex-1">Cancel</Button>

                        <Button
                            className="h-11 bg-blue-900 hover:bg-black font-semibold uppercase text-[11px] px-8 flex-1"
                            disabled={
                                workflowMutation.isPending || 
                                ((selectedReq?.status !== 'Pending' && selectedReq?.status !== 'Pending Review' && selectedReq?.status !== 'Revoked') && 
                                (!approvalDetails.supplier_id || !approvalDetails.temp_price || approvalDetails.temp_price <= 0 || !approvalDetails.payment_method_id))
                            }
                            onClick={() => {
                                const qtyApproving = approvalDetails.quantity_approving;
                                const qtyRequested = selectedReq?.quantity_requested || 0;
                                const isDraft = selectedReq?.status === 'Pending' || selectedReq?.status === 'Pending Review' || selectedReq?.status === 'Revoked';

                                workflowMutation.mutate({
                                    reqId: selectedReq?.id,
                                    qty: qtyApproving,
                                    itemId: selectedReq?.item_id,
                                    details: approvalDetails,
                                    nextStatus: isDraft ? 'Pending' : 'Approved',
                                });
                            }}
                        >
                            {workflowMutation.isPending ? "Processing..." : 
                             (selectedReq?.status === 'Pending' || selectedReq?.status === 'Pending Review' || selectedReq?.status === 'Revoked') ? "Save Draft Quote" : "Confirm Authorization"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Add Supplier Dialog */}
            < Dialog open={isAddSupplierOpen} onOpenChange={setIsAddSupplierOpen} >
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-900" />
                            Register New Supplier
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Supplier Name</Label>
                                <Input
                                    placeholder="Company Name"
                                    className="h-10 text-sm"
                                    value={newSupplier.name}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Category</Label>
                                <Select
                                    value={newSupplier.category}
                                    onValueChange={(val) => {
                                        setNewSupplier({ ...newSupplier, category: val });
                                        setShowCustomCategory(val === 'Other');
                                    }}
                                >
                                    <SelectTrigger className="h-10 text-xs text-slate-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="General Spare Parts">General Spare Parts</SelectItem>
                                        <SelectItem value="Tires & Alignment">Tires & Alignment</SelectItem>
                                        <SelectItem value="Oils & Lubricants">Oils & Lubricants</SelectItem>
                                        <SelectItem value="Fuel & Additives">Fuel & Additives</SelectItem>
                                        <SelectItem value="Engineering Tools">Engineering Tools</SelectItem>
                                        <SelectItem value="Other">Other (Custom...)</SelectItem>
                                    </SelectContent>
                                </Select>
                                {showCustomCategory && (
                                    <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <Input
                                            placeholder="Enter manual category..."
                                            className="h-9 text-xs border-blue-100 bg-blue-50/30"
                                            value={newSupplier.customCategory}
                                            onChange={(e) => setNewSupplier({ ...newSupplier, customCategory: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>
                        </div >
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Contact Person</Label>
                                    <Input
                                        placeholder="Full Name"
                                        className="h-10 text-sm"
                                        value={newSupplier.contact_person}
                                        onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-[11px] font-semibold text-slate-500 uppercase">Phone Numbers</Label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 px-1 text-[10px] text-blue-900 hover:text-blue-700 font-semibold"
                                            onClick={() => setNewSupplier({ ...newSupplier, phone: [...newSupplier.phone, ""] })}
                                        >
                                            <Plus className="w-3 h-3 mr-0.5" /> add
                                        </Button>
                                    </div>
                                    <div className="space-y-2 overflow-y-auto max-h-[80px] scrollbar-thin">
                                        {newSupplier.phone.map((p, idx) => (
                                            <Input
                                                key={idx}
                                                placeholder={idx === 0 ? "Primary (+255...)" : "Additional..."}
                                                className="h-9 text-xs"
                                                value={p}
                                                onChange={(e) => {
                                                    const next = [...newSupplier.phone];
                                                    next[idx] = e.target.value;
                                                    setNewSupplier({ ...newSupplier, phone: next });
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Email Address</Label>
                                <Input
                                    placeholder="vendor@example.com"
                                    className="h-10 text-sm"
                                    value={newSupplier.email}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Location</Label>
                                <Input
                                    placeholder="Physical Address"
                                    className="h-10 text-sm"
                                    value={newSupplier.location}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, location: e.target.value })}
                                />
                            </div>
                        </div>
                    </div >
                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button variant="ghost" onClick={() => setIsAddSupplierOpen(false)} className="h-11 font-semibold uppercase text-[11px] text-slate-500">Cancel</Button>
                        <Button
                            className="h-11 bg-blue-950 hover:bg-black font-semibold uppercase text-[11px] px-8 transition-all shadow-md active:scale-[0.98]"
                            disabled={addSupplierMutation.isPending}
                            onClick={() => {
                                if (!newSupplier.name.trim()) {
                                    toast({
                                        variant: "destructive",
                                        title: "Name Required",
                                        description: "Please enter the supplier name."
                                    });
                                    return;
                                }
                                const finalCategory = newSupplier.category === 'Other' ? newSupplier.customCategory : newSupplier.category;
                                const cleanedPhones = newSupplier.phone.filter(p => p.trim() !== "").join(", ");

                                addSupplierMutation.mutate({
                                    ...newSupplier,
                                    category: finalCategory,
                                    phone: cleanedPhones
                                });
                            }}
                        >
                            {addSupplierMutation.isPending ? "Registering..." : "Register Supplier"}
                        </Button>
                    </DialogFooter>
                </DialogContent >
            </Dialog >

            {/* Edit Supplier Dialog */}
            < Dialog open={isEditSupplierOpen} onOpenChange={setIsEditSupplierOpen} >
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-900" />
                            Edit Supplier Details
                        </DialogTitle>
                    </DialogHeader>
                    {editingSupplier && (
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Supplier Name</Label>
                                <Input
                                    placeholder="Supplier Name"
                                    className="h-10 text-sm font-semibold text-blue-900"
                                    value={editingSupplier.name}
                                    onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Category</Label>
                                    <Select
                                        value={editingSupplier.category}
                                        onValueChange={(val) => setEditingSupplier({ ...editingSupplier, category: val })}
                                    >
                                        <SelectTrigger className="h-10 text-xs text-blue-900 font-semibold border-blue-50">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="General Spare Parts">General Spare Parts</SelectItem>
                                            <SelectItem value="Tires & Alignment">Tires & Alignment</SelectItem>
                                            <SelectItem value="Oils & Lubricants">Oils & Lubricants</SelectItem>
                                            <SelectItem value="Fuel & Additives">Fuel & Additives</SelectItem>
                                            <SelectItem value="Engineering Tools">Engineering Tools</SelectItem>
                                            <SelectItem value="Other">Other (Custom...)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Contact Person</Label>
                                    <Input
                                        placeholder="Full Name"
                                        className="h-10 text-sm"
                                        value={editingSupplier.contact_person}
                                        onChange={(e) => setEditingSupplier({ ...editingSupplier, contact_person: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Phone Numbers</Label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] text-blue-900 border-blue-100 font-semibold"
                                        onClick={() => setEditPhones([...editPhones, ""])}
                                    >
                                        <Plus className="w-3 h-3 mr-1" /> Add
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 max-h-[100px] overflow-y-auto pr-1 scrollbar-thin">
                                    {editPhones.map((p, idx) => (
                                        <Input
                                            key={idx}
                                            placeholder="Contact..."
                                            className="h-9 text-xs"
                                            value={p}
                                            onChange={(e) => {
                                                const next = [...editPhones];
                                                next[idx] = e.target.value;
                                                setEditPhones(next);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Email</Label>
                                    <Input
                                        placeholder="vendor@example.com"
                                        className="h-10 text-sm"
                                        value={editingSupplier.email}
                                        onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Location</Label>
                                    <Input
                                        placeholder="Physical Address"
                                        className="h-10 text-sm"
                                        value={editingSupplier.location}
                                        onChange={(e) => setEditingSupplier({ ...editingSupplier, location: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="border-t pt-4">
                        <Button variant="ghost" onClick={() => setIsEditSupplierOpen(false)} className="h-11 font-semibold uppercase text-[11px] text-slate-500">Cancel</Button>
                        <Button
                            className="h-11 bg-blue-950 hover:bg-black font-semibold uppercase text-[11px] px-8 transition-all shadow-md active:scale-[0.98]"
                            onClick={() => {
                                const phones = editPhones.filter(p => p.trim() !== "").join(", ");
                                updateSupplierMutation.mutate({ ...editingSupplier, phone: phones });
                            }}
                            disabled={updateSupplierMutation.isPending}
                        >
                            {updateSupplierMutation.isPending ? "Saving..." : "Update Supplier"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Update Pricing Dialog */}
            < Dialog open={isUpdatePriceOpen} onOpenChange={setIsUpdatePriceOpen} >
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-900" />
                            Update Unit Pricing
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="p-3 bg-slate-50 rounded border text-center">
                            <Label className="text-xs uppercase font-semibold text-slate-500">Selected Item</Label>
                            <p className="font-semibold text-slate-900">{selectedInventoryItem?.item_name}</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">Current Market Price (TZS)</Label>
                            <Input
                                type="number"
                                className="h-10 text-sm border-slate-200 font-semibold text-blue-900"
                                value={updatePriceDetails.unit_price}
                                onChange={(e) => setUpdatePriceDetails({ ...updatePriceDetails, unit_price: parseFloat(e.target.value) })}
                            />
                            <p className="text-[11px] text-slate-400 italic">This price will be used for all future requisitions of this item.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            className="h-10 bg-blue-900 hover:bg-black text-xs font-semibold uppercase px-8"
                            onClick={() => updatePricingMutation.mutate({
                                id: selectedInventoryItem?.id,
                                price: updatePriceDetails.unit_price
                            })}
                            disabled={updatePricingMutation.isPending}
                        >
                            {updatePricingMutation.isPending ? "Saving..." : "Save Pricing"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Add Payment Method Dialog */}
            < Dialog open={isAddPaymentMethodOpen} onOpenChange={setIsAddPaymentMethodOpen} >
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-blue-900" />
                            Add Payment Account
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="p-3 bg-slate-50 rounded border text-center">
                            <Label className="text-xs uppercase font-medium text-slate-500">Supplier</Label>
                            <p className="font-semibold text-slate-900">{selectedSupplierForPayment?.name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase">Method Type</Label>
                                <Select
                                    value={newPaymentMethod.method_type}
                                    onValueChange={(val) => setNewPaymentMethod({ ...newPaymentMethod, method_type: val })}
                                >
                                    <SelectTrigger className="h-10 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Bank">Bank Transfer</SelectItem>
                                        <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                                        <SelectItem value="Cash">Cash</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase">
                                    {newPaymentMethod.method_type === 'Mobile Money' ? 'Network Provider' :
                                        newPaymentMethod.method_type === 'Cash' ? 'Reference' : 'Bank Name'}
                                </Label>
                                <Input
                                    placeholder={newPaymentMethod.method_type === 'Mobile Money' ? 'e.g., M-Pesa, TigoPesa' :
                                        newPaymentMethod.method_type === 'Cash' ? 'Internal Ref' : 'e.g., NMB, CRDB'}
                                    className="h-10 text-sm"
                                    value={newPaymentMethod.bank_name}
                                    onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, bank_name: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">
                                {newPaymentMethod.method_type === 'Mobile Money' ? 'Lipa Number' : 'Account Number'}
                            </Label>
                            <Input
                                placeholder="Number..."
                                className="h-10 text-sm font-mono"
                                value={newPaymentMethod.account_number}
                                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, account_number: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">Account Name</Label>
                            <Input
                                placeholder="Registered Name"
                                className="h-10 text-sm"
                                value={newPaymentMethod.account_name}
                                onChange={(e) => setNewPaymentMethod({ ...newPaymentMethod, account_name: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddPaymentMethodOpen(false)} className="h-10 text-xs font-semibold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-blue-950 hover:bg-black text-xs font-semibold uppercase px-8"
                            onClick={() => addPaymentMethodMutation.mutate({
                                ...newPaymentMethod,
                                supplier_id: selectedSupplierForPayment?.id
                            })}
                            disabled={!newPaymentMethod.account_number || !newPaymentMethod.account_name || addPaymentMethodMutation.isPending}
                        >
                            {addPaymentMethodMutation.isPending ? "Creating..." : "Save Method"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Edit Payment Method Dialog */}
            < Dialog open={isEditPaymentMethodOpen} onOpenChange={setIsEditPaymentMethodOpen} >
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-blue-900" />
                            Edit Payment Account
                        </DialogTitle>
                    </DialogHeader>
                    {editingPaymentMethod && (
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase">Method Type</Label>
                                    <Select
                                        value={editingPaymentMethod.method_type}
                                        onValueChange={(val) => setEditingPaymentMethod({ ...editingPaymentMethod, method_type: val })}
                                    >
                                        <SelectTrigger className="h-10 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Bank">Bank Transfer</SelectItem>
                                            <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                                            <SelectItem value="Cash">Cash</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase">
                                        {editingPaymentMethod.method_type === 'Mobile Money' ? 'Network Provider' :
                                            editingPaymentMethod.method_type === 'Cash' ? 'Reference' : 'Bank Name'}
                                    </Label>
                                    <Input
                                        placeholder={editingPaymentMethod.method_type === 'Mobile Money' ? 'e.g., M-Pesa, TigoPesa' :
                                            editingPaymentMethod.method_type === 'Cash' ? 'Internal Ref' : 'e.g., NMB, CRDB'}
                                        className="h-10 text-sm"
                                        value={editingPaymentMethod.bank_name || ""}
                                        onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, bank_name: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase">
                                    {editingPaymentMethod.method_type === 'Mobile Money' ? 'Lipa Number' : 'Account Number'}
                                </Label>
                                <Input
                                    placeholder="Number..."
                                    className="h-10 text-sm font-mono"
                                    value={editingPaymentMethod.account_number || ""}
                                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, account_number: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase">Account Name</Label>
                                <Input
                                    placeholder="Registered Name"
                                    className="h-10 text-sm"
                                    value={editingPaymentMethod.account_name || ""}
                                    onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, account_name: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditPaymentMethodOpen(false)} className="h-10 text-xs font-semibold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-blue-900 hover:bg-black text-xs font-semibold uppercase px-8"
                            onClick={() => editPaymentMethodMutation.mutate(editingPaymentMethod)}
                            disabled={editPaymentMethodMutation.isPending}
                        >
                            {editPaymentMethodMutation.isPending ? "Saving..." : "Update Method"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Create Requisition Dialog (Keep as is) */}
            < Dialog open={isCreateReqOpen} onOpenChange={setIsCreateReqOpen} >
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-blue-900" />
                            Internal Requisition
                        </DialogTitle>
                    </DialogHeader>
                    {/* ... (Existing dialog content) */}
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Target Company</Label>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setIsManageDeptsOpen(true);
                                        }}
                                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                                    >
                                        + MANAGE COMPANIES
                                    </button>
                            </div>
                            <Select
                                value={newReq.target_company}
                                onValueChange={(val) => setNewReq({ ...newReq, target_company: val })}
                            >
                                <SelectTrigger className="h-10 text-sm border-slate-200">
                                    <SelectValue placeholder="Select company..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {(departments || []).map((dept: any) => (
                                        <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                                    ))}
                                    {(!departments || departments.length === 0) && (
                                        <div className="p-2 text-xs text-slate-500">No companies found</div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Item Description</Label>
                            <Input
                                placeholder="Enter item name"
                                className="h-10 text-sm border-slate-200"
                                value={newReq.item_name}
                                onChange={(e) => setNewReq({ ...newReq, item_name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Quantity Requested</Label>
                            <Input
                                type="number"
                                className="h-10 text-sm border-slate-200"
                                value={newReq.quantity}
                                onChange={(e) => setNewReq({ ...newReq, quantity: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateReqOpen(false)} className="h-10 text-[11px] font-semibold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-blue-900 hover:bg-black text-[11px] font-semibold uppercase"
                            onClick={() => createReqMutation.mutate(newReq)}
                            disabled={!newReq.item_name || createReqMutation.isPending}
                        >
                            {createReqMutation.isPending ? "Submitting..." : "Send Request"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Manage Departments Dialog */}
            <Dialog open={isManageDeptsOpen} onOpenChange={setIsManageDeptsOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-blue-900" />
                            Manage Target Companies
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="New company name..."
                                value={newDeptName}
                                onChange={(e) => setNewDeptName(e.target.value)}
                                className="h-9 text-sm"
                            />
                            <Button
                                size="sm"
                                className="bg-blue-900 hover:bg-black h-9"
                                onClick={() => addDepartmentMutation.mutate(newDeptName)}
                                disabled={!newDeptName.trim() || addDepartmentMutation.isPending}
                            >
                                <Plus className="w-4 h-4 mr-1" /> Add
                            </Button>
                        </div>
                        <ScrollArea className="h-[200px] border rounded-md p-2">
                            <div className="space-y-2">
                                {(departments || []).map((dept: any) => (
                                    <div key={dept.id} className="flex justify-between items-center p-2 bg-slate-50 border rounded-md">
                                        <span className="text-sm font-medium">{dept.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => {
                                                if(confirm('Are you sure you want to delete this company?')) {
                                                    deleteDepartmentMutation.mutate(dept.id);
                                                }
                                            }}
                                            disabled={deleteDepartmentMutation.isPending}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                                {(!departments || departments.length === 0) && (
                                    <div className="p-4 text-center text-sm text-slate-500">No companies found</div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Revoke Reason Dialog */}
            < Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen} >
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-700">
                            <XCircle className="w-5 h-5 text-red-500" />
                            Revoke Requisition
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                            <p className="text-xs text-red-700 font-medium">
                                This requisition will be marked as <strong>Revoked</strong>. The garage team will see this status and the reason you provide below.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700">Management's Reason for Rejection</Label>
                            <Textarea
                                placeholder="Enter the reason from management (e.g., 'Not in budget', 'Item not needed', etc.)"
                                className="min-h-[100px] text-sm"
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                            />
                            <p className="text-xs text-slate-400 italic">This reason will be visible to the requester</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setRevokeDialogOpen(false);
                                setRevokeReason("");
                                setRevokeDialogReqId(null);
                            }}
                            className="h-10"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="h-10 bg-red-600 hover:bg-red-700"
                            onClick={() => {
                                if (!revokeReason.trim()) {
                                    toast({
                                        variant: "destructive",
                                        title: "Reason Required",
                                        description: "Please enter a reason for revoking this requisition."
                                    });
                                    return;
                                }
                                if (revokeDialogReqId) {
                                    updateStatusMutation.mutate({
                                        reqId: revokeDialogReqId,
                                        status: 'Revoked',
                                        revokeReason: revokeReason
                                    });
                                    setRevokeDialogOpen(false);
                                    setRevokeReason("");
                                    setRevokeDialogReqId(null);
                                }
                            }}
                            disabled={updateStatusMutation.isPending || !revokeReason.trim()}
                        >
                            {updateStatusMutation.isPending ? "Revoking..." : "Confirm Revoke"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >
            {/* Grouped PO Review Dialog */}
            < Dialog open={isGroupedPODialogOpen} onOpenChange={setIsGroupedPODialogOpen} >
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileCheck className="w-6 h-6 text-blue-950" />
                                Grouped PO Review
                            </div>
                            <Badge variant="outline" className="text-[10px] font-semibold uppercase py-1 bg-indigo-50 text-blue-950 border-indigo-200">
                                {groupedPODetails.company}
                            </Badge>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden py-4 flex flex-col gap-6">
                        {/* Selected Items List */}
                        <div className="space-y-3">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-2">
                                <Package className="w-4 h-4" /> Selected Items ({selectedRequisitionIds.length})
                            </Label>
                            <ScrollArea className="h-[200px] rounded-xl border border-slate-100 bg-slate-50/50 p-1">
                                <div className="p-3 space-y-2">
                                    {requisitions?.filter((r: any) => selectedRequisitionIds.includes(r.id)).map((req: any) => (
                                        <div key={req.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between group">
                                            <div>
                                                <p className="font-semibold text-slate-800 text-sm">{req.item_name}</p>
                                                <p className="text-[10px] text-slate-400 font-medium">Requested on {new Date(req.created_at).toLocaleDateString()}</p>
                                            </div>
                                            <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-200 border-none font-semibold">
                                                Qty: {req.quantity_requested}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* PO Finalization Details */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Supplier Details</Label>
                                <Select
                                    value={groupedPODetails.supplier_id}
                                    onValueChange={(val) => setGroupedPODetails({ ...groupedPODetails, supplier_id: val })}
                                >
                                    <SelectTrigger className="h-11 border-slate-200 shadow-sm">
                                        <SelectValue placeholder="Select Supplier" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(suppliers || []).map((s: any) => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Generated PO Number</Label>
                                <Input
                                    value={groupedPODetails.po_number}
                                    onChange={(e) => setGroupedPODetails({ ...groupedPODetails, po_number: e.target.value })}
                                    className="h-11 font-mono font-semibold text-blue-950 border-slate-200 shadow-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="border-t pt-6">
                        <Button
                            variant="ghost"
                            onClick={() => setIsGroupedPODialogOpen(false)}
                            className="h-11 font-semibold uppercase text-[11px] px-6 text-slate-500 hover:text-slate-700"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="h-11 bg-blue-950 hover:bg-black font-semibold uppercase text-[11px] px-10 shadow-lg shadow-indigo-100"
                            disabled={!groupedPODetails.supplier_id || !groupedPODetails.po_number || bulkUpdateRequisitionsMutation.isPending}
                            onClick={() => bulkUpdateRequisitionsMutation.mutate({
                                ids: selectedRequisitionIds,
                                po_number: groupedPODetails.po_number,
                                supplier_id: groupedPODetails.supplier_id
                            })}
                        >
                            {bulkUpdateRequisitionsMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                "Finalize Grouped PO"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Receive Goods Dialog */}
            <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Truck className="w-5 h-5 text-blue-900" />
                            Receive Goods
                        </DialogTitle>
                    </DialogHeader>

                    {receivingItem && (
                        <div className="grid gap-4 py-4">
                            <div className="p-3 bg-slate-50 rounded border">
                                <Label className="text-[10px] uppercase font-bold text-slate-500">Item Details</Label>
                                <p className="font-semibold text-slate-900">{receivingItem.item_name}</p>
                                <p className="text-[11px] text-slate-500">PO: {receivingItem.po_number}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Paid Quantity</Label>
                                    <Input
                                        disabled
                                        value={receivingItem.quantity_approved}
                                        className="h-10 font-bold bg-slate-100 text-slate-500 border-slate-200"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-semibold text-slate-500 uppercase">Received Quantity</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={receivingQuantity}
                                        onChange={(e) => setReceivingQuantity(parseInt(e.target.value) || 0)}
                                        className="h-10 font-bold text-blue-900 border-blue-200 bg-blue-50/20"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Notes (Optional)</Label>
                                <Textarea
                                    placeholder="Any discrepancies or remarks..."
                                    value={receivingNote}
                                    onChange={(e) => setReceivingNote(e.target.value)}
                                    className="h-20 text-sm border-slate-200 resize-none"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsReceiveDialogOpen(false)} className="h-10 text-xs font-semibold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold uppercase px-6"
                            onClick={() => {
                                if (receivingQuantity <= 0) {
                                    toast({ variant: "destructive", title: "Invalid Quantity", description: "Quantity must be greater than 0." });
                                    return;
                                }
                                workflowMutation.mutate({
                                    reqId: receivingItem.id,
                                    qty: receivingQuantity,
                                    itemId: receivingItem.item_id, // Pass item_id for stock update
                                    details: {
                                        ...approvalDetails,
                                        received_at: new Date().toISOString(),
                                        received_note: receivingNote
                                    },
                                    nextStatus: 'Arrived'
                                });
                                setIsReceiveDialogOpen(false);
                            }}
                            disabled={workflowMutation.isPending}
                        >
                            {workflowMutation.isPending ? "Processing..." : "Confirm Receipt"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Supplier Delete Confirmation Dialog */}
            <Dialog open={!!supplierToDelete} onOpenChange={(open) => !open && setSupplierToDelete(null)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-rose-600 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Delete Supplier
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-slate-600">
                            Are you sure you want to delete <strong className="text-slate-900">{supplierToDelete?.name}</strong>? 
                            This action cannot be undone and will also delete any linked payment methods.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSupplierToDelete(null)}>Cancel</Button>
                        <Button 
                            variant="destructive" 
                            disabled={deleteSupplierMutation.isPending}
                            onClick={() => {
                                deleteSupplierMutation.mutate(supplierToDelete.id);
                                setSupplierToDelete(null);
                            }}
                        >
                            {deleteSupplierMutation.isPending ? "Deleting..." : "Yes, Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <POPreviewDialog 
                isOpen={isPreviewDialogOpen}
                onClose={() => setIsPreviewDialogOpen(false)}
                supplierName={previewSupplierName}
                reqs={previewReqs}
            />

            {/* Hidden file input for shop receipt upload */}
            <input
                ref={shopReceiptInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !uploadingShopReceiptId) return;
                    
                    try {
                        const fileExt = file.name.split('.').pop();
                        const filePath = `shop-receipts/${uploadingShopReceiptId}-${Date.now()}.${fileExt}`;
                        const { error: uploadError } = await (supabase as any).storage
                            .from('receipts')
                            .upload(filePath, file);
                        if (uploadError) throw uploadError;
                        
                        const { data: urlData } = (supabase as any).storage
                            .from('receipts')
                            .getPublicUrl(filePath);
                        
                        const { error: updateError } = await sb
                            .from("garage_requisitions")
                            .update({ delivery_receipt_url: urlData?.publicUrl })
                            .eq("id", uploadingShopReceiptId);
                        if (updateError) throw updateError;

                        queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
                        toast({ title: "Shop Receipt Uploaded", description: "The receipt from the supplier has been saved." });
                    } catch (err: any) {
                        toast({ variant: "destructive", title: "Upload Failed", description: err.message || "Could not upload shop receipt." });
                    }
                    
                    setUploadingShopReceiptId(null);
                    e.target.value = ''; // Reset file input
                }}
            />

            {/* Receipt Viewer Dialog */}
            <Dialog open={isReceiptViewerOpen} onOpenChange={setIsReceiptViewerOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-indigo-600" />
                            {receiptViewerTitle}
                        </DialogTitle>
                    </DialogHeader>
                    {viewReceiptUrl && (
                        viewReceiptUrl.endsWith('.pdf') ? (
                            <iframe src={viewReceiptUrl} className="w-full h-[60vh] rounded-md border" />
                        ) : (
                            <img src={viewReceiptUrl} alt="Receipt" className="w-full rounded-md border" />
                        )
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsReceiptViewerOpen(false)}>Close</Button>
                        {viewReceiptUrl && (
                            <a href={viewReceiptUrl} target="_blank" rel="noopener noreferrer">
                                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Open Full Size
                                </Button>
                            </a>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Add Supplier Dialog */}
            <Dialog open={quickAddSupplierOpen} onOpenChange={setQuickAddSupplierOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add New Supplier</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="supplier-name">Supplier Name</Label>
                            <Input
                                id="supplier-name"
                                value={newSupplierName}
                                onChange={(e) => setNewSupplierName(e.target.value)}
                                placeholder="e.g. TotalEnergies Ltd"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuickAddSupplierOpen(false)}>Cancel</Button>
                        <Button 
                            onClick={handleQuickAddSupplier} 
                            disabled={isAddingSupplier || !newSupplierName.trim()}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isAddingSupplier ? "Saving..." : "Save Supplier"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Add Account Dialog */}
            <Dialog open={quickAddAccountOpen} onOpenChange={setQuickAddAccountOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add New Payment Account</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="acc-name">Account Name (e.g. Mobile Money / Bank Name)</Label>
                            <Input
                                id="acc-name"
                                value={newAccountName}
                                onChange={(e) => setNewAccountName(e.target.value)}
                                placeholder="e.g. John Doe / CRDB Bank"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="acc-bank">Bank/Network Name</Label>
                            <Input
                                id="acc-bank"
                                value={newAccountBank}
                                onChange={(e) => setNewAccountBank(e.target.value)}
                                placeholder="e.g. MPESA / CRDB"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="acc-number">Account / Phone Number</Label>
                            <Input
                                id="acc-number"
                                value={newAccountNumber}
                                onChange={(e) => setNewAccountNumber(e.target.value)}
                                placeholder="e.g. 07XXXXXXXX"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuickAddAccountOpen(false)}>Cancel</Button>
                        <Button 
                            onClick={handleQuickAddAccount} 
                            disabled={isAddingAccount || !newAccountName.trim() || !newAccountBank.trim() || !newAccountNumber.trim()}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isAddingAccount ? "Saving..." : "Save Account"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isQuickEditOpen} onOpenChange={setIsQuickEditOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-slate-800">Admin Quick Edit</DialogTitle>
                        <DialogDescription className="text-xs">
                            Directly modify quantity and unit price. This immediately updates the database.
                            <div className="mt-2 font-bold text-indigo-600">{quickEditData.item_name}</div>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label className="text-xs font-bold text-slate-600 uppercase">Quantity Requested</Label>
                                <Input
                                    type="number"
                                    value={quickEditData.quantity_requested}
                                    onChange={(e) => setQuickEditData({ ...quickEditData, quantity_requested: Number(e.target.value) })}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs font-bold text-slate-600 uppercase">Quantity Approved</Label>
                                <Input
                                    type="number"
                                    value={quickEditData.quantity_approved}
                                    onChange={(e) => setQuickEditData({ ...quickEditData, quantity_approved: Number(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                            <div className="grid gap-1.5">
                                <Label className="text-xs font-bold text-blue-900 uppercase">Pack Size (Units/Pack)</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="1"
                                    value={quickEditData.pack_size || 1}
                                    onChange={(e) => setQuickEditData({ ...quickEditData, pack_size: Math.max(1, Number(e.target.value) || 1) })}
                                    className="bg-white border-blue-200"
                                />
                                <span className="text-[10px] text-slate-500">e.g. 20 for 20L can</span>
                            </div>
                            <div className="grid gap-1.5 justify-center">
                                <Label className="text-xs font-bold text-blue-900 uppercase">Packs to Buy</Label>
                                <div className="h-10 flex items-center justify-center font-black text-lg text-indigo-700 bg-white border border-blue-200 rounded-md">
                                    {Math.ceil((quickEditData.quantity_approved || 0) / (quickEditData.pack_size || 1))} {((quickEditData.pack_size || 1) > 1) ? 'cans' : 'units'}
                                </div>
                                <span className="text-[10px] text-slate-500 text-center">
                                    {quickEditData.quantity_approved || 0} ÷ {quickEditData.pack_size || 1}
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-1.5">
                            <Label className="text-xs font-bold text-slate-600 uppercase">
                                Unit Price (TZS) {((quickEditData.pack_size || 1) > 1) ? '— Price Per Pack/Can' : '— Price Per Unit'}
                            </Label>
                            <Input
                                type="number"
                                value={quickEditData.unit_price}
                                onChange={(e) => setQuickEditData({ ...quickEditData, unit_price: Number(e.target.value) })}
                            />
                        </div>

                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-center">
                            <span className="font-semibold text-slate-600">Calculated Subtotal:</span>
                            <span className="font-black text-sm text-indigo-900">
                                {(Math.ceil((quickEditData.quantity_approved || 0) / (quickEditData.pack_size || 1)) * (quickEditData.unit_price || 0)).toLocaleString()} TZS
                            </span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsQuickEditOpen(false)}>Cancel</Button>
                        <Button 
                            className="bg-indigo-600 text-white hover:bg-indigo-700" 
                            disabled={quickEditMutation.isPending}
                            onClick={() => quickEditMutation.mutate(quickEditData)}
                        >
                            {quickEditMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ProcurementDashboard;
