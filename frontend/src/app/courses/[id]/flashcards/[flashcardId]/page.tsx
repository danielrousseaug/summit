"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { FlashcardDetail, FlashcardItem } from "@/types/flashcard";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Shuffle,
  List,
  BookOpen
} from "lucide-react";
import { FlashcardArray } from "react-quizlet-flashcard";
import "react-quizlet-flashcard/dist/index.css";

// Simple custom flashcard component as fallback
function SimpleFlashcard({ card, index, total, onNext, onPrev }: {
  card: { front: { text: string }, back: { text: string } },
  index: number,
  total: number,
  onNext: () => void,
  onPrev: () => void
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  // Reset flip state when card changes
  useEffect(() => {
    setIsFlipped(false);
  }, [index]);

  return (
    <div className="w-full">
      <div
        className="relative w-full h-96 cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
        style={{ perspective: '1000px' }}
      >
        <div
          className="absolute inset-0 transition-transform duration-500 rounded-lg shadow-lg"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 bg-white border-2 border-gray-200 rounded-lg p-8 flex items-center justify-center text-center"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <p className="text-xl font-semibold text-gray-900 whitespace-pre-line">{card.front.text}</p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 bg-gray-50 border-2 border-gray-300 rounded-lg p-8 flex items-center justify-center text-center"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <p className="text-lg text-gray-700 whitespace-pre-line">{card.back.text}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={onPrev}
          disabled={index === 0}
          className="cursor-pointer"
        >
          Previous
        </Button>
        <span className="text-sm text-gray-600">
          {index + 1} / {total}
        </span>
        <Button
          variant="outline"
          onClick={onNext}
          disabled={index === total - 1}
          className="cursor-pointer"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default function StudyFlashcardsPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string; flashcardId: string }>();
  const [flashcardSet, setFlashcardSet] = useState<FlashcardDetail | null>(null);
  const [shuffleMode, setShuffleMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  useEffect(() => {
    if (!auth.token || !params?.flashcardId) return;
    (async () => {
      try {
        setError(null);
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/flashcards/${params.flashcardId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          cache: "no-store",
        });
        if (!resp.ok) throw new Error("Failed to load flashcard set");
        const data = (await resp.json()) as FlashcardDetail;
        setFlashcardSet(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load flashcard set");
      }
    })();
  }, [auth.token, params?.flashcardId]);

  // Reset to first card when shuffle mode changes
  useEffect(() => {
    setCurrentCardIndex(0);
  }, [shuffleMode]);

  if (!auth.token) return <RequireAuth />;

  // Prepare flashcards for the library
  const prepareCards = (cards: FlashcardItem[], shuffle: boolean) => {
    let preparedCards = cards.map((card, idx) => ({
      id: card.id,
      front: {
        text: `${card.card_type === 'qa' ? '❓ Question' : '📝 Term'}\n\n${card.front}`
      },
      back: {
        text: `${card.card_type === 'qa' ? '✅ Answer' : '📖 Definition'}\n\n${card.back}`
      },
    }));

    if (shuffle) {
      // Fisher-Yates shuffle
      for (let i = preparedCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [preparedCards[i], preparedCards[j]] = [preparedCards[j], preparedCards[i]];
      }
    }

    return preparedCards;
  };

  const cards = flashcardSet && flashcardSet.cards ? prepareCards(flashcardSet.cards, shuffleMode) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/courses/${params?.id}?tab=flashcards`} className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Course
              </Link>
            </Button>
            {flashcardSet && flashcardSet.cards && flashcardSet.cards.length > 0 && (
              <div className="flex items-center gap-3">
                <Button
                  variant={!shuffleMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShuffleMode(false)}
                  className={!shuffleMode ? "bg-gray-900 hover:bg-gray-800" : ""}
                >
                  <List className="w-4 h-4 mr-2" />
                  Sequential
                </Button>
                <Button
                  variant={shuffleMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShuffleMode(true)}
                  className={shuffleMode ? "bg-gray-900 hover:bg-gray-800" : ""}
                >
                  <Shuffle className="w-4 h-4 mr-2" />
                  Shuffle
                </Button>
              </div>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Study Flashcards</h1>
          <p className="text-gray-600 dark:text-gray-300">
            {flashcardSet?.syllabus_item_title ? flashcardSet.syllabus_item_title : 'Review your flashcards'}
          </p>
        </div>

        {error && (
          <Card className="shadow-sm border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 mb-6">
            <CardContent className="p-6">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {!flashcardSet && !error && (
          <div className="space-y-6">
            <div className="animate-pulse bg-white dark:bg-gray-800 h-96 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700" />
          </div>
        )}

        {flashcardSet && flashcardSet.cards && cards && cards.length > 0 && (
          <div className="space-y-6">
            {/* Flashcard Display */}
            <Card className="shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <CardContent className="p-6">
                <div className="flashcard-container">
                  {cards.length > 0 ? (
                    <SimpleFlashcard
                      card={cards[currentCardIndex]}
                      index={currentCardIndex}
                      total={cards.length}
                      onNext={() => setCurrentCardIndex(Math.min(currentCardIndex + 1, cards.length - 1))}
                      onPrev={() => setCurrentCardIndex(Math.max(currentCardIndex - 1, 0))}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full p-12">
                      <p className="text-gray-500">Loading flashcards...</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
              <CardHeader>
                <div className="flex items-start space-x-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <BookOpen className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Study Tips</CardTitle>
                    <CardDescription className="text-sm">
                      Get the most out of your flashcards
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>Click the card to flip between front and back</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>Use Previous/Next buttons to navigate cards</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>Try to recall the answer before flipping</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>Use shuffle mode for better long-term retention</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {flashcardSet && cards.length === 0 && (
          <Card className="shadow-sm border border-gray-200 dark:border-gray-700 text-center py-12">
            <CardContent>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No cards in this set</h3>
              <p className="text-gray-600 dark:text-gray-300">This flashcard set appears to be empty.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function RequireAuth() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-sm border border-gray-100 dark:border-gray-700">
        <CardHeader className="text-center">
          <CardTitle>Access Required</CardTitle>
          <CardDescription>Please login to study flashcards</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full bg-gray-900 hover:bg-gray-800">
            <Link href="/auth">Login / Register</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
