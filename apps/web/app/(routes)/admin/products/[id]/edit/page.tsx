'use client';

import { Button, Center, Container, HStack, Heading, Spinner, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import Guard from '@/components/admin/guard';
import ProductForm from '@/components/admin/product-form';
import type { ProductFormValues } from '@/components/admin/product-form-fields';
import { HttpError } from '@/lib/core/http';
import { useProduct } from '@/services/queries/products/use-product';
import { useUpdateProduct } from '@/services/queries/products/use-update-product';

/** Map a saved Product into the UI-friendly form shape (cents→major, arrays→csv). */
const toFormValues = (product: Product): ProductFormValues => {
  return {
    discogsReleaseId: product.discogsReleaseId,
    title: product.title,
    artist: product.artist,
    year: product.year,
    genresText: product.genres.join(', '),
    formatText: product.format.join(', '),
    imageUrl: product.imageUrl,
    price: product.priceCents / 100,
    currency: product.currency,
    stock: product.stock,
    isHot: product.isHot,
  };
};

const EditProductForm = ({ id }: { id: string }) => {
  const router = useRouter();
  const { data: product, isPending, error } = useProduct(id);
  const updateMutation = useUpdateProduct();

  if (isPending) {
    return (
      <Center minH="40vh">
        <Spinner />
      </Center>
    );
  }

  if (error || !product) {
    return (
      <Container maxW="3xl" py="8">
        <Text color="red.500">Product not found.</Text>
      </Container>
    );
  }

  const errorMessage = (() => {
    if (updateMutation.error instanceof HttpError && updateMutation.error.status === 409) {
      return 'A product for this Discogs release already exists.';
    }
    if (updateMutation.error) return 'Could not save changes. Check the fields and try again.';
    return null;
  })();

  return (
    <Container maxW="3xl" py="8">
      <HStack justify="space-between" mb="6">
        <Heading size="lg">Edit product</Heading>
        <Button asChild variant="ghost">
          <NextLink href="/admin/products">Back</NextLink>
        </Button>
      </HStack>

      <ProductForm
        initialValues={toFormValues(product)}
        submitLabel="Save changes"
        submitting={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(payload) =>
          updateMutation.mutate(
            { id, input: payload },
            { onSuccess: () => router.push('/admin/products') },
          )
        }
      />
    </Container>
  );
};

const EditProductPage = () => {
  const params = useParams<{ id: string }>();

  return (
    <Guard>
      <EditProductForm id={params.id} />
    </Guard>
  );
};

export default EditProductPage;
