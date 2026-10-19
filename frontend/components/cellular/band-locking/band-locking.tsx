"use client";

import { useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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

// One card per category; titles and descriptions are cards.<category>.*
const BAND_CARDS: { category: BandCategory }[] = [
  { category: "lte" },
  { category: "nsa_nr5g" },
  { category: "sa_nr5g" },
];

export default function BandLockingComponent() {
  const { t } = useTranslation("band-locking");
  const { data, isLoading, isBusy, error, lockBands, resetBands } =
    useRadioSettings();
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = async () => {
    setConfirmReset(false);
    const result = await resetBands();
    if (result.ok) toast.success(t("factory.toast_restored"));
    else toast.error(result.message);
  };

  return (
    <PageShell
      title={t("page.title")}
      description={t("page.description")}
    >
      {BAND_CARDS.map((card) => (
        <BandCardsComponent
          key={card.category}
          title={t(`cards.${card.category}.title`)}
          description={t(`cards.${card.category}.description`)}
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
          <CardTitle>{t("factory.title")}</CardTitle>
          <CardDescription>{t("factory.description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={isBusy || isLoading}
          >
            <RotateCcwIcon />
            {t("factory.button")}
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("factory.dialog_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("factory.dialog_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              {t("factory.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
