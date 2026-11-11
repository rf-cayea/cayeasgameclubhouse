CREATE TABLE IF NOT EXISTS crown_chance_rooms(code TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS crown_chance_requests(principal TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,response TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(principal,request_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS crown_chance_rewards(match_id TEXT PRIMARY KEY NOT NULL,room_code TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);
