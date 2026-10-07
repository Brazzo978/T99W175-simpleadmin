"use client";

import { useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import BandCardsComponent from "./band-cards";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRadioSettings } from "@/hooks/use-radio-settings";
import type { BandCategory } from "@/types/band-locking";

const BAND_CARDS: { category: BandCategory; title: string; description: string }[] = [
  {
    category: "lte",
    title: "LTE Band Locking",
    description: "LTE bands the modem may use.",
  },
  {
    category: "nsa_nr5g",
    title: "NSA Band Locking",
    description: "5G bands usable with an LTE anchor (NSA).",
  },
  {
    category: "sa_nr5g",
    title: "SA Band Locking",
    description: "5G bands usable standalone (SA).",
  },
];

export default function BandLockingComponent() {
  const { data, isLoading, isBusy, error, lockBands, resetBands } =
    useRadioSettings();
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = async () => {
    setConfirmReset(false);
    const result = await resetBands();
    if (result.ok) toast.success("Band preferences restored");
    else toast.error(result.message);
  };

  return (
    <PageShell
      title="Band Locking"
      description="Choose which bands the modem may use. Locking applies at once and can drop the connection for a few seconds."
    >
      {BAND_CARDS.map((card) => (
        <BandCardsComponent
          key={card.category}
          title={card.title}
          description={card.description}
          bandCategory={card.category}
          supportedBands={data?.bands.supported[card.category] ?? []}
          currentLockedBands={data?.bands.enabled[card.category] ?? []}
          onLock={async (bands) => (await lockBands(card.category, bands)).ok}
          onUnlockAll={async () =>
            (
              await lockBands(
                card.category,
                data?.bands.supported[card.category] ?? [],
              )
            ).ok
          }
          isLocking={isBusy}
          isLoading={isLoading}
          error={error}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Factory Band Preferences</CardTitle>
          <CardDescription>
            Restores the band preferences of every technology to the firmware
            defaults.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={isBusy || isLoading}
          >
            <RotateCcwIcon />
            Restore Defaults
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore band defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              Every LTE and 5G band lock is removed. The connection may drop for
              a few seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
