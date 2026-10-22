import React from 'react';
import { View } from 'react-native';

import { EmptyPlannerState } from './EmptyPlannerState';
import { PlannerSelectionCard } from './PlannerSelectionCard';

import type { PlannerCardViewModel, VerseSummaryDetails } from './AddToPlannerModal';

export function PlannerCardsSection({
  plannerCards,
  verseSummary,
  selectedPlanId,
  onPlanSelect,
}: {
  plannerCards: PlannerCardViewModel[];
  verseSummary: VerseSummaryDetails;
  selectedPlanId: string | null;
  onPlanSelect: (planId: string) => void;
}): React.JSX.Element {
  if (plannerCards.length === 0) {
    return (
      <View className="w-full">
        <EmptyPlannerState verseLabel={verseSummary.verseKey} />
      </View>
    );
  }

  return (
    <View className="w-full gap-3">
      {plannerCards.map((plan) => (
        <PlannerSelectionCard
          key={plan.reactKey}
          planName={plan.planName}
          verseRangeLabel={plan.verseRangeLabel}
          {...(typeof plan.estimatedDays === 'number' ? { estimatedDays: plan.estimatedDays } : {})}
          isSelected={typeof selectedPlanId === 'string' ? plan.planIds.includes(selectedPlanId) : false}
          onSelect={() => onPlanSelect(plan.id)}
        />
      ))}
    </View>
  );
}

