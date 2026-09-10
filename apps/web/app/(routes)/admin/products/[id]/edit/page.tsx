'use client';

import { Button, Center, Container, Spinner, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import ProductForm from '@/components/admin/product-form';
import type { ProductFormValues } from '@/components/admin/product-form-fields';
import SectionHeading from '@/components/ui/section-heading';
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
    slideOrder: product.slideOrder,
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
        <Text color="fg.error">Product not found.</Text>
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
    <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '8', md: '12' }}>
      <SectionHeading
        eyebrow="Catalogue"
        title="Edit product"
        description={`${product.artist} — ${product.title}`}
        action={
          <Button asChild size="sm" variant="outline" borderRadius="full">
            <NextLink href={`/products/${product.id}`}>View in shop</NextLink>
          </Button>
        }
      />

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

  return <EditProductForm id={params.id} />;
};

export default EditProductPage;
