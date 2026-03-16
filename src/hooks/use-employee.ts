"use client";

import { useEffect, useState } from "react";
import { useUser, useOrganization } from "@clerk/nextjs";
import { createClient } from "@/lib/supabase/client";
import type { Employee, Organization } from "@/types";

interface EmployeeContext {
  employee: Employee | null;
  organization: Organization | null;
  isLoading: boolean;
  error: string | null;
}

export function useEmployee(): EmployeeContext {
  const { user, isLoaded: userLoaded } = useUser();
  const { organization: clerkOrg, isLoaded: orgLoaded } = useOrganization();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoaded || !orgLoaded || !user || !clerkOrg) {
      if (userLoaded && orgLoaded) setIsLoading(false);
      return;
    }

    const fetchContext = async () => {
      try {
        const supabase = createClient();

        // Fetch organization
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("*")
          .eq("clerk_org_id", clerkOrg.id)
          .single();

        if (orgError) throw orgError;
        setOrganization(orgData);

        // Fetch employee profile
        const { data: empData, error: empError } = await supabase
          .from("employees")
          .select("*")
          .eq("clerk_user_id", user.id)
          .eq("org_id", orgData.id)
          .single();

        if (empError && empError.code !== "PGRST116") throw empError;
        setEmployee(empData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContext();
  }, [user, clerkOrg, userLoaded, orgLoaded]);

  return { employee, organization, isLoading, error };
}
