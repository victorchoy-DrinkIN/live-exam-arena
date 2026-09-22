ALTER TABLE `exam_questions` MODIFY COLUMN `correctOption` int;--> statement-breakpoint
ALTER TABLE `exam_answers` ADD `responseText` text;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `questionType` enum('multiple_choice','fill_blank') DEFAULT 'multiple_choice' NOT NULL;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `correctAnswer` text;