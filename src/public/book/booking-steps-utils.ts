// src/public/book/booking-steps-utils.ts

import { BookingProgressContext } from './context';
import { getNextStep, StepLabel } from 'src/availability-context';

/**
 * Transitions to the next step in the booking flow and updates expanded steps
 * to implement the sequential step display feature.
 * 
 * When a user completes a step, this function:
 * 1. Gets the next step from the flow
 * 2. Adds it to the expandedSteps array if it's not already there
 * 3. Updates the current step in the BookingProgressContext
 * 
 * @param currentStepLabel The label of the current/completed step
 * @returns The step number of the next step
 */
export function transitionToNextStep(currentStepLabel: StepLabel): number {
  // Get the next step in the flow
  const nextStep = getNextStep(currentStepLabel);
  
  // Get current progress state
  const currentProgress = BookingProgressContext.value;
  
  // Create a copy of the current expanded steps
  const expandedSteps = [...(currentProgress.expandedSteps || [])];
  
  // Add the next step to expanded steps if it's not already there
  if (nextStep > 0 && !expandedSteps.includes(nextStep)) {
    expandedSteps.push(nextStep);
  }
  
  // Update the booking progress context with new step and expanded steps
  BookingProgressContext.set({
    currentStep: nextStep,
    expandedSteps
  });
  
  return nextStep;
}

/**
 * Sets a specific step as active without changing the expanded steps.
 * Used when clicking on a previously completed step.
 * 
 * @param stepNumber The step number to set as active
 */
export function setActiveStep(stepNumber: number): void {
  BookingProgressContext.set({
    currentStep: stepNumber
  });
}
