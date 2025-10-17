export type Flashcard = {
  id: number;
  course_id: number;
  syllabus_item_id?: number;
  syllabus_item_title?: string;
  created_at: string;
  num_cards: number;
};

export type FlashcardItem = {
  id: number;
  order_index: number;
  front: string;
  back: string;
  card_type: 'qa' | 'term_definition';
};

export type FlashcardDetail = {
  id: number;
  course_id: number;
  syllabus_item_id?: number;
  syllabus_item_title?: string;
  created_at: string;
  cards: FlashcardItem[];
};
