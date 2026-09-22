CREATE TABLE `exam_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`questionId` int NOT NULL,
	`participantId` int NOT NULL,
	`selectedOption` int,
	`isCorrect` boolean NOT NULL DEFAULT false,
	`responseMs` int,
	`answeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`displayName` varchar(80) NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`correctCount` int NOT NULL DEFAULT 0,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_participant_name_idx` UNIQUE(`examId`,`displayName`)
);
--> statement-breakpoint
CREATE TABLE `exam_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`position` int NOT NULL,
	`prompt` text NOT NULL,
	`options` text NOT NULL,
	`correctOption` int NOT NULL,
	`timeLimitSeconds` int NOT NULL DEFAULT 30,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `live_exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(12) NOT NULL,
	`title` varchar(255) NOT NULL,
	`status` enum('draft','live','complete') NOT NULL DEFAULT 'draft',
	`activeQuestionIndex` int NOT NULL DEFAULT -1,
	`currentQuestionStartedAt` timestamp,
	`currentQuestionEndsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `live_exams_id` PRIMARY KEY(`id`),
	CONSTRAINT `live_exams_code_unique` UNIQUE(`code`)
);
