'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/contexts/AppDataContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search, Car, Building, Route } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VehiclesList } from "./fleet/VehiclesList";
import { FacilityBookingsList } from "./fleet/FacilityBookingsList";
import { VehicleForm } from "./fleet/VehicleForm";
import { FleetTrackingConsole } from "./fleet/tracking/FleetTrackingConsole";
import { LoadingAnimation } from "@/components/ui/loading-animation";

/**
 * Fleet and rented properties.
 *
 * Vehicles owns two sub-views: the registry of vehicle records, and the GPS
 * console that replaced the old standalone "Patrolling & Trips" tab. Tracking
 * belongs with the vehicles it tracks, so the two now sit side by side.
 */

type TopTab = 'vehicles' | 'facilities';
type VehicleView = 'registry' | 'tracking';

export function FacilitiesFleet() {
  const { activeBranch, isLoading } = useAppData();
  const [activeTab, setActiveTab] = useState<TopTab>('vehicles');
  const [vehicleView, setVehicleView] = useState<VehicleView>('registry');
  const [searchQuery, setSearchQuery] = useState("");
  const [isVehicleFormOpen, setIsVehicleFormOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoadingAnimation size="lg" />
      </div>
    );
  }

  // The search box only filters the registry and the properties list; the GPS
  // console has its own device filter.
  const showSearch = activeTab === 'facilities' || vehicleView === 'registry';
  const showAddVehicle = activeTab === 'vehicles' && vehicleView === 'registry';

  const cardTitle =
    activeTab === 'facilities'
      ? 'Manage Rented Properties'
      : vehicleView === 'tracking'
        ? 'Patrolling & Trips — GPS Console'
        : 'Fleet Management';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Fleet &amp; Rented Properties Management</h2>

        <div className="flex gap-2">
          {showAddVehicle && (
            <Dialog open={isVehicleFormOpen} onOpenChange={setIsVehicleFormOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center gap-1">
                  <PlusCircle className="h-4 w-4" />
                  <span>Add Vehicle</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Register New Vehicle</DialogTitle>
                </DialogHeader>
                <VehicleForm
                  branchId={activeBranch}
                  onSuccess={() => setIsVehicleFormOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {showSearch && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                activeTab === "facilities"
                  ? "Search properties..."
                  : "Search vehicles, registration..."
              }
              className="pl-8 w-full"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{cardTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TopTab)}>
            <TabsList className="h-11 p-1 mb-6">
              <TabsTrigger value="vehicles" className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium">
                <Car className="h-4 w-4" />
                <span>Vehicles</span>
              </TabsTrigger>
              <TabsTrigger value="facilities" className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium">
                <Building className="h-4 w-4" />
                <span>Manage Rented Properties</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vehicles" className="space-y-4">
              {/* Sub-navigation inside Vehicles */}
              <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setVehicleView('registry')}
                  aria-current={vehicleView === 'registry' ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                    vehicleView === 'registry'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  <Car className="h-4 w-4" />
                  Vehicle Registry
                </button>
                <button
                  type="button"
                  onClick={() => setVehicleView('tracking')}
                  aria-current={vehicleView === 'tracking' ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                    vehicleView === 'tracking'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  <Route className="h-4 w-4" />
                  Patrolling &amp; Trips
                </button>
              </div>

              {vehicleView === 'registry' ? (
                <VehiclesList branchId={activeBranch} searchQuery={searchQuery} />
              ) : (
                <FleetTrackingConsole />
              )}
            </TabsContent>

            <TabsContent value="facilities">
              <FacilityBookingsList
                branchId={activeBranch}
                searchQuery={searchQuery}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
