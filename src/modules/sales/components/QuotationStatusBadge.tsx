'use client';

import { Badge } from "@/components/ui/badge";

export const getStatusBadge = (status: string) => {
  switch (status) {
    case "Draft":
      return <Badge className="bg-gray-500 hover:bg-gray-600">{status}</Badge>;
    case "Pending":
      return <Badge className="bg-amber-500 hover:bg-amber-600">{status}</Badge>;
    case "Sent":
      return <Badge className="bg-blue-500 hover:bg-blue-600">{status}</Badge>;
    case "Revised":
      return <Badge className="bg-purple-500 hover:bg-purple-600">{status}</Badge>;
    case "Accepted":
    case "Approved":
      return <Badge className="bg-green-500 hover:bg-green-600">Accepted</Badge>;
    case "Rejected":
      return <Badge className="bg-red-500 hover:bg-red-600">{status}</Badge>;
    case "Expired":
      return <Badge className="bg-gray-400 hover:bg-gray-500">{status}</Badge>;
    case "Converted":
      return <Badge className="bg-emerald-600 hover:bg-emerald-700">{status}</Badge>;
    default:
      return <Badge>{status || "Unknown"}</Badge>;
  }
};

export const getPricingTypeBadge = (type: string | undefined) => {
  if (!type) return null;
  switch (type) {
    case "Minimum Wages":
      return <Badge className="bg-black hover:bg-black/80">{type}</Badge>;
    case "Customized":
      return <Badge className="bg-red-500 hover:bg-red-600">{type}</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
};
