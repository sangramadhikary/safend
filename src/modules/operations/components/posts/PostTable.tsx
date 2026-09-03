'use client';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash2, Users, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Post } from "@/types/operations";

const getStatusBadge = (status: string) => {
  switch (status?.toLowerCase()) {
    case "active":
      return <Badge className="bg-green-500 hover:bg-green-600">{status}</Badge>;
    case "inactive":
      return <Badge className="bg-gray-500 hover:bg-gray-600">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

interface PostTableProps {
  posts: Post[];
  onEdit: (post: Post) => void;
  onView: (postId: string) => void;
}

export function PostTable({ posts, onEdit, onView }: PostTableProps) {
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    toast({
      title: "Post Deleted",
      description: `Post ${id} has been deleted successfully.`,
      duration: 3000,
    });
  };
  
  const handleViewStaff = (id: string, name: string) => {
    toast({
      title: "Viewing Staff",
      description: `Viewing staff assigned to ${name}.`,
      duration: 3000,
    });
  };
  
  const handleViewSchedule = (id: string, name: string) => {
    toast({
      title: "Viewing Schedule",
      description: `Viewing schedule for ${name}.`,
      duration: 3000,
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>Complete list of security posts</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Post ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Client</TableHead>
            <TableHead className="hidden lg:table-cell">Location</TableHead>
            <TableHead>Required Staff</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.length > 0 ? (
            posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell className="font-medium">{post.code || post.id}</TableCell>
                <TableCell>{post.name}</TableCell>
                <TableCell className="hidden md:table-cell">{post.clientName}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  {post.address ? post.address.split(',')[0] : 'N/A'}
                </TableCell>
                <TableCell>
                  {post.requiredStaff ? post.requiredStaff.reduce((total, staff) => total + staff.count, 0) : 0}
                </TableCell>
                <TableCell>{getStatusBadge(post.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onView(post.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleViewStaff(post.id, post.name)}
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleViewSchedule(post.id, post.name)}
                    >
                      <Calendar className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onEdit(post)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-500 hover:text-red-600" 
                      onClick={() => handleDelete(post.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-6">
                No posts found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
