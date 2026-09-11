'use client';

import { Container, Text } from '@chakra-ui/react';

import ProductForm, { blankProductForm } from '@/components/admin/product-form';
import SectionHeading from '@/components/ui/section-heading';
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
    <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '8', md: '12' }}>
      <SectionHeading
        eyebrow="Catalogue"
        title="Add product"
        description="Import metadata from Discogs, then set your own price, stock and placement."
      />

      {/* Stays on the page after a successful add and clears the form for the next one. */}
      {createMutation.isSuccess ? (
        <Text mb="4" color="fg.success">
          Product added — the form is cleared for the next one.
        </Text>
      ) : null}

      <ProductForm
        initialValues={blankProductForm}
        enableDiscogsImport
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

export default NewProductForm;
