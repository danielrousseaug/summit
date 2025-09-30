export type Quiz = {
  id: number;
  course_id: number;
  syllabus_item_id?: number;
  syllabus_item_title?: string;
  created_at: string;
  num_questions: number;
};

export type QuizDetail = {
  id: number;
  course_id: number;
  created_at: string;
  questions: { id: number; order_index: number; prompt: string; options: string[] }[];
};
