'use client';

import { Button, Dialog, Field, Input, Portal, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

/** What the API couldn't tell about an album's artist. */
export interface ArtistQuestion {
  /** The album as search names it, for the dialog to show. */
  title: string;
  /** The artists owning its names; empty when the title names none. */
  artists: { id: string; name: string }[];
}

/**
 * Asks who an album is by, when the API couldn't tell (tracker.md §5.7):
 * which of the artists owning its names, or — the title naming none — what
 * the artist is called.
 *
 * @param question - what to ask, or null when closed
 * @param onClose - called when dismissed without an answer
 * @param onAnswer - called with the artist picked, or the name typed
 */
export default function ArtistDialog({
  question,
  onClose,
  onAnswer,
}: {
  question: ArtistQuestion | null;
  onClose: () => void;
  onAnswer: (answer: { artistId: string } | { artistName: string }) => void;
}) {
  const [name, setName] = useState('');
  const picking = (question?.artists.length ?? 0) > 0;

  return (
    <Dialog.Root
      open={question !== null}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      onExitComplete={() => setName('')}
      placement="center"
      size="sm"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="card" mx="4">
            <Dialog.Header>
              <Dialog.Title>{picking ? 'Which artist is it?' : 'Who is it by?'}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="4">
                <Text color="fg.muted" fontSize="sm">
                  {question?.title}
                </Text>
                {picking ? (
                  <Stack gap="2">
                    {question?.artists.map((artist) => (
                      <Button
                        key={artist.id}
                        variant="outline"
                        borderRadius="full"
                        justifyContent="start"
                        onClick={() => onAnswer({ artistId: artist.id })}
                      >
                        {artist.name}
                      </Button>
                    ))}
                  </Stack>
                ) : (
                  <Field.Root>
                    <Field.Label>Artist</Field.Label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="As the site should show it"
                    />
                    <Field.HelperText>
                      The title names no artist, so the record needs one.
                    </Field.HelperText>
                  </Field.Root>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="ghost" borderRadius="full">
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              {picking ? null : (
                <Button
                  colorPalette="brand"
                  borderRadius="full"
                  disabled={name.trim().length === 0}
                  onClick={() => onAnswer({ artistName: name.trim() })}
                >
                  Add
                </Button>
              )}
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
