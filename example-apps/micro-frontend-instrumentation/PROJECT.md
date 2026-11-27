# Photo Service Project Definition
## Overview
Build a photo service with two main user experiences:

Main screen:
- Shows a list of uploaded photos from all users
- If no photos exist, shows an empty state

Photo details screen:
- Displays the selected photo in detail
- Shows comments from other users
- Allows authenticated users to add comments

The target audience is a senior software engineer who will implement the system, so this definition focuses on product scope, architecture, data model, APIs, security, and  non-functional requirements.

## Goals
- Provide a simple and scalable photo browsing experience
- Allow users to view photo metadata and community comments
- Restrict comment creation to authenticated users
- Keep the design implementation-ready, with clear backend and frontend boundaries

# Non-Goals
- Photo editing
- Albums or collections
- Private photo sharing
- Reactions/likes
- Advanced moderation workflows
- Real-time chat


## Core Functional Requirements
1. Photo Listing
The system must:

- Display a paginated list of uploaded photos on the main screen
- Show key summary information for each photo:
- photo ID
- image URL / thumbnail URL
- title or caption
- uploader
- upload timestamp
- comment count
- Support empty state when no photos are available
- Support sorting by newest first by default

2. Photo Details
When a user selects a photo, the system must:

- Display the full photo or a larger render
- Show photo metadata
- Show associated comments
- Show comment author and timestamp
- Load comments in a stable order, preferably oldest-first or newest-first consistently

3. Authentication and Authorization
The system must:

- Allow anonymous users to browse photos and read comments
- Require authentication to add comments
- Associate each comment with the authenticated user identity
- Prevent unauthenticated comment submission

4. Comment Creation
Authenticated users must be able to:

- Submit a text comment on a photo
- See validation errors for invalid input
- See their comment appear after successful submission
The system should:

- Enforce maximum comment length
- Reject empty comments
- Sanitize or safely render user-generated text

## User Stories
Anonymous User
- As an anonymous user, I want to see all uploaded photos so that I can browse available content
- As an anonymous user, I want to open a photo and read comments so that I can understand context and discussion
Authenticated User
- As an authenticated user, I want to add a comment to a photo so that I can participate in discussion
- As an authenticated user, I want my comment to be attributed to me