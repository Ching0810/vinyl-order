import { Badge } from '@chakra-ui/react';

/** "Unpaid", quieter than the status beside it: grey, unoutlined. */
export default function UnpaidBadge() {
  return (
    <Badge bg="gray.200" color="gray.800" borderRadius="full" px="2.5" py="0.5">
      Unpaid
    </Badge>
  );
}
