'use client';

import { Button, Container, HStack, Heading, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import AdminGuard from '@/components/admin/admin-guard';
import ProductForm, { blankProductForm } from '@/components/admin/product-form';
import { HttpError } from '@/lib/core/http';
import { useCreateProduct } from '@/services/queries/products/use-create-product';

const NewProductForm = () => {
  const createMutation = useCreateProduct();

  const errorMessage = (() => {
    if (createMutation.error instanceof HttpError && createMutation.error.status === 409) {
      return 'A product for this Discogs release already exists.';
    }
    if (createMutation.error) return 'Could not save the product. Check the fields and try again.';
    return null;
  })();

  return (
    <Container maxW="3xl" py="8">
      <HStack justify="space-between" mb="6">
        <Heading size="lg">Add product</Heading>
        <HStack gap="2">
          <Button asChild variant="ghost">
            <NextLink href="/">Store</NextLink>
          </Button>
          <Button asChild variant="ghost">
            <NextLink href="/admin/products">Back</NextLink>
          </Button>
        </HStack>
      </HStack>

      {/* Stays on the page after a successful add and clears the form for the next one. */}
      {createMutation.isSuccess ? (
        <Text mb="4" color="green.600">
          Product added — the form is cleared for the next one.
        </Text>
      ) : null}

      <ProductForm
        initialValues={blankProductForm}
        submitLabel="Create product"
        submitting={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(payload, { reset }) =>
          createMutation.mutate(payload, { onSuccess: () => reset() })
        }
      />
    </Container>
  );
};

const NewProductPage = () => (
  <AdminGuard>
    <NewProductForm />
  </AdminGuard>
);

export default NewProductPage;
