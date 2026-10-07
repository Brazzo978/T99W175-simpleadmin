"use client";

import { useAboutDevice } from "@/hooks/use-about-device";
import DeviceInformationCard from "./device-information-card";
import AboutSimpleAdminCard from "./about-simpleadmin-card";

const AboutDeviceComponent = () => {
  const { data, isLoading, error, refresh } = useAboutDevice();

  return (
    <div className="@container/main mx-auto p-2">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">About Device</h1>
        <p className="text-muted-foreground">
          Device identity, network addresses, and system information.
        </p>
      </div>
      <div className="grid grid-cols-1 @3xl/main:grid-cols-2 grid-flow-row gap-4">
        <DeviceInformationCard
          data={data}
          isLoading={isLoading}
          error={error}
          onRetry={refresh}
        />
        <AboutSimpleAdminCard data={data} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default AboutDeviceComponent;
