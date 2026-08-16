'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Plus,
  ArrowRight,
  FolderKanban,
  Building2,
} from 'lucide-react';
import { Navigation } from '@/components/layout/navigation';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  organizations: {
    id: string;
    name: string;
  };
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  user_role: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ email?: string; full_name?: string; avatar_url?: string } | undefined>(undefined);

  useEffect(() => {
    fetchProjectsData();
  }, []);

  const fetchProjectsData = async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        router.push('/auth/login');
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name, avatar_url')
        .eq('id', authUser.id)
        .maybeSingle();

      setUser(profile || { email: authUser.email || undefined });

      // Fetch organizations
      const { data: orgData, error: orgError } = await supabase
        .from('organization_members')
        .select(`
          role,
          organizations (
            id,
            name,
            slug,
            description
          )
        `)
        .eq('user_id', authUser.id);

      if (orgError) throw orgError;

      const orgs = orgData?.map((member: any) => ({
        ...member.organizations,
        user_role: member.role,
      })) || [];
      setOrganizations(orgs);

      // Fetch projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          *,
          organizations (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={fetchProjectsData} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation user={user} />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Manage your projects and organizations</p>
          </div>
          {organizations.length > 0 && (
            <Button onClick={() => router.push('/organizations')}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          )}
        </div>

        {/* Organizations */}
        {organizations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Your Organizations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map((org) => (
                <Card key={org.id} className="hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => router.push(`/organizations/${org.id}`)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {org.name}
                      </CardTitle>
                      <Badge variant="outline">{org.user_role}</Badge>
                    </div>
                    <CardDescription>{org.slug}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {org.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {org.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">All Projects</h2>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              {organizations.length === 0 ? (
                <>
                  <p className="text-muted-foreground text-center mb-4">
                    Create an organization first to start managing projects
                  </p>
                  <Button onClick={() => router.push('/organizations')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Organization
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-center mb-4">
                    Create your first project to get started
                  </p>
                  <Button onClick={() => router.push('/organizations')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card key={project.id} className="hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                      {project.status}
                    </Badge>
                  </div>
                  <CardDescription>{project.organizations.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center text-sm text-muted-foreground">
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Open project
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
