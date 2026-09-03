'use client';

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KnowledgeBaseArticle } from "@/types/helpdesk";
import { getKnowledgeBaseArticles } from "@/services/helpdesk/HelpdeskService";
import { useEffect, useState } from "react";
import { LoadingAnimation } from "@/components/ui/loading-animation";

interface KnowledgeBaseListProps {
  branchId: string;
  searchQuery?: string;
  category?: string;
}

export function KnowledgeBaseList({ branchId, searchQuery, category }: KnowledgeBaseListProps) {
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    try {
      setIsLoading(true);
      // Get articles from service
      const fetchedArticles = getKnowledgeBaseArticles(branchId);
      
      // Apply filters
      let filteredArticles = fetchedArticles;
      
      if (category) {
        filteredArticles = filteredArticles.filter(article => 
          article.category.toLowerCase() === category.toLowerCase()
        );
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredArticles = filteredArticles.filter(article => 
          article.title.toLowerCase().includes(query) || 
          article.content.toLowerCase().includes(query) ||
          article.tags.some(tag => tag.toLowerCase().includes(query))
        );
      }
      
      setArticles(filteredArticles);
    } catch (error) {
      console.error("Error fetching knowledge base articles:", error);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, category, searchQuery]);
  
  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingAnimation size="md" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {articles.map(article => (
        <Card key={article.id} className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-medium mb-2">{article.title}</h3>
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                {article.content}
              </p>
              {article.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {article.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                <span>Views: {article.views}</span>
                <span className="ml-3">Helpful: {article.helpful}</span>
              </div>
            </div>
            <Button variant="outline">Read Article</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
