-- ### ZenCom Community Feature SQL Schema ###

-- 1. Create the 'communities' table
CREATE TABLE communities (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the 'community_members' table
CREATE TABLE community_members (
    community_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', -- e.g., 'member', 'admin', 'moderator'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);

-- 3. Modify the 'posts' table to include 'community_id'
ALTER TABLE posts
ADD COLUMN community_id BIGINT REFERENCES communities(id) ON DELETE SET NULL;

-- 4. Set up Storage Bucket for community avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-avatars', 'community-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ### Row Level Security (RLS) Policies ###

-- RLS for 'profiles' table
-- Add a policy to allow users to insert their own profile
CREATE POLICY "Allow users to insert their own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Enable RLS for the new tables
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Policies for 'communities' table
-- a. Anyone can view all communities
CREATE POLICY "Allow public read access to communities"
ON communities
FOR SELECT
USING (true);

-- b. Authenticated users can create new communities
CREATE POLICY "Allow authenticated users to create communities"
ON communities
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- c. Only the creator or an admin can update a community's info
CREATE POLICY "Allow creators to update their own communities"
ON communities
FOR UPDATE
USING (auth.uid() = created_by);

-- d. Only the creator can delete their community
CREATE POLICY "Allow creators to delete their own communities"
ON communities
FOR DELETE
USING (auth.uid() = created_by);


-- Policies for 'community_members' table
-- a. Users can see who is in the communities they are members of
CREATE POLICY "Allow members to see other members of their communities"
ON community_members
FOR SELECT
USING (
    community_id IN (
        SELECT community_id FROM community_members WHERE user_id = auth.uid()
    )
);

-- b. Authenticated users can join or leave communities
CREATE POLICY "Allow authenticated users to join/leave communities"
ON community_members
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow users to leave communities"
ON community_members
FOR DELETE
USING (auth.uid() = user_id);

-- c. Community creators/admins can manage members (future enhancement)
-- CREATE POLICY "Allow admins to manage members" ...


-- Policies for 'posts' table (modification)
-- a. Users can only create posts in communities they are a member of
-- First, drop the old insert policy if it exists
DROP POLICY IF EXISTS "Allow authenticated users to create posts" ON posts;

-- Create a new policy
CREATE POLICY "Allow members to create posts in their communities"
ON posts
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    community_id IS NOT NULL AND -- Ensure a community is selected
    community_id IN (
        SELECT community_id FROM community_members WHERE user_id = auth.uid()
    )
);

-- b. Users can see posts from communities they are members of, or public posts
-- First, drop the old select policy if it exists
DROP POLICY IF EXISTS "Allow public read access to posts" ON posts;

-- Create a new policy for timeline feed (posts from joined communities)
CREATE POLICY "Allow members to see posts from their communities"
ON posts
FOR SELECT
USING (
    community_id IN (
        SELECT community_id FROM community_members WHERE user_id = auth.uid()
    )
);

-- It might also be useful to have a policy for an "explore" feed
-- where users can see all posts from all communities.
-- CREATE POLICY "Allow authenticated users to see all posts"
-- ON posts
-- FOR SELECT
-- USING (auth.role() = 'authenticated');


-- Policies for 'community-avatars' Storage Bucket
-- a. Allow authenticated users to upload avatars
CREATE POLICY "Allow authenticated users to upload community avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'community-avatars');

-- b. Allow anyone to view community avatars
CREATE POLICY "Allow public read access to community avatars"
ON storage.objects
FOR SELECT
USING (bucket_id = 'community-avatars');

-- c. Allow creators to update or delete their community's avatar
CREATE POLICY "Allow creators to update their community avatar"
ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'community-avatars' AND
    auth.uid() = (
        SELECT created_by FROM communities WHERE avatar_url LIKE '%' || name
    )
);

CREATE POLICY "Allow creators to delete their community avatar"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'community-avatars' AND
    auth.uid() = (
        SELECT created_by FROM communities WHERE avatar_url LIKE '%' || name
    )
);

-- ### END OF SCHEMA ###
